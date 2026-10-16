"""JSON REST API for the Receipt & Expense Organizer mobile app.

The phone uploads a receipt photo/PDF; Claude extracts the data and the expense
is categorized (rules first, Claude fallback). Nothing is stored server-side:
the app keeps its own records. The Anthropic key never leaves this server.

Endpoints (all but /v1/health need `Authorization: Bearer <API_TOKEN>`):
    GET  /v1/health       liveness check
    GET  /v1/categories   valid categories for the app's picker
    POST /v1/extract      multipart `receipt` -> extracted, categorized receipt

Errors are always `{"error": {"code": "...", "message": "..."}}`.

Run:
    python app.py                          # dev server (or set PORT)
    gunicorn "app:create_app()"            # production
"""

from __future__ import annotations

import hmac
import logging
import os
from typing import Optional

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from werkzeug.exceptions import HTTPException

import categorizer
from agent import (
    ExtractionError,
    FileTooLarge,
    UnsupportedFileType,
    categorize,
    extract_receipt_bytes,
)

MAX_UPLOAD_BYTES = 15 * 1024 * 1024

log = logging.getLogger(__name__)


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def error_response(status: int, code: str, message: str):
    return jsonify(error={"code": code, "message": message}), status


def create_app(api_token: Optional[str] = None) -> Flask:
    load_dotenv()
    logging.basicConfig(level=logging.INFO)

    token = api_token or os.getenv("API_TOKEN")
    if not token:
        raise RuntimeError("API_TOKEN is not set. Add it to your .env (see .env.example).")

    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES

    @app.before_request
    def require_token():
        if request.path == "/v1/health":
            return None
        header = request.headers.get("Authorization", "")
        supplied = header.removeprefix("Bearer ").strip()
        if not (header.startswith("Bearer ") and hmac.compare_digest(supplied, token)):
            return error_response(401, "unauthorized", "Missing or invalid API token.")
        return None

    @app.get("/v1/health")
    def health():
        return jsonify(status="ok")

    @app.get("/v1/categories")
    def categories():
        return jsonify(
            categories=categorizer.CATEGORIES, default=categorizer.DEFAULT_CATEGORY
        )

    @app.post("/v1/extract")
    def extract():
        file = request.files.get("receipt")
        if file is None:
            raise ApiError(422, "validation_error", "Attach the file as form field 'receipt'.")
        data = file.read()
        if not data:
            raise ApiError(422, "validation_error", "The uploaded file is empty.")

        try:
            receipt = extract_receipt_bytes(data)
        except UnsupportedFileType as exc:
            raise ApiError(415, "unsupported_file_type", str(exc)) from exc
        except FileTooLarge as exc:
            raise ApiError(413, "file_too_large", str(exc)) from exc
        except ExtractionError as exc:
            log.error("Extraction failed: %s", exc)
            raise ApiError(
                502, "extraction_failed", "Couldn't extract this receipt. Try again, or check the server logs."
            ) from exc

        result = categorize(receipt.vendor, receipt.line_items)
        return jsonify(
            receipt={
                **receipt.model_dump(),
                "category": result.category,
                "category_source": result.source,
            }
        )

    @app.errorhandler(ApiError)
    def handle_api_error(exc: ApiError):
        return error_response(exc.status, exc.code, exc.message)

    @app.errorhandler(HTTPException)
    def handle_http_error(exc: HTTPException):
        if exc.code == 413:
            return error_response(413, "file_too_large", "That file is too large (limit is 15 MB).")
        code = {404: "not_found", 405: "method_not_allowed"}.get(exc.code, "bad_request")
        return error_response(exc.code or 400, code, exc.description or "Bad request.")

    @app.errorhandler(Exception)
    def handle_unexpected(exc: Exception):
        log.exception("Unhandled error")
        return error_response(500, "internal", "Something went wrong on the server.")

    return app


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    create_app().run(port=port)
