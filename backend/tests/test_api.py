"""Endpoint tests for the JSON API. Extraction and categorization are stubbed;
their behavior is covered in test_agent.py."""

import io

import pytest

import app as app_module
from agent import Categorization, ExtractionError, FileTooLarge, Receipt, UnsupportedFileType

TOKEN = "test-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}
RECEIPT = Receipt(
    vendor="Green Supermarket",
    date=None,
    total_amount=27.35,
    currency=None,
    confidence="medium",
    needs_review=True,
    review_reason="No date on the receipt.",
)


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(app_module, "extract_receipt_bytes", lambda data: RECEIPT)
    monkeypatch.setattr(
        app_module, "categorize", lambda vendor, items: Categorization("Groceries", "claude")
    )
    return app_module.create_app(api_token=TOKEN).test_client()


def upload(client, data=b"\xff\xd8\xff fake jpeg", headers=AUTH):
    return client.post(
        "/v1/extract",
        data={"receipt": (io.BytesIO(data), "receipt.jpg")},
        headers=headers,
        content_type="multipart/form-data",
    )


def stub_extract_error(monkeypatch, exc):
    def boom(data):
        raise exc

    monkeypatch.setattr(app_module, "extract_receipt_bytes", boom)


def test_health_needs_no_token(client):
    res = client.get("/v1/health")
    assert res.status_code == 200
    assert res.get_json() == {"status": "ok"}


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer wrong"}, {"Authorization": TOKEN}])
def test_missing_or_bad_token_is_rejected(client, headers):
    res = upload(client, headers=headers)
    assert res.status_code == 401
    assert res.get_json()["error"]["code"] == "unauthorized"


def test_categories(client):
    body = client.get("/v1/categories", headers=AUTH).get_json()
    assert "Groceries" in body["categories"]
    assert body["default"] == "Other"


def test_extract_success(client):
    res = upload(client)
    assert res.status_code == 200
    receipt = res.get_json()["receipt"]
    assert receipt["vendor"] == "Green Supermarket"
    assert receipt["total_amount"] == 27.35
    assert receipt["needs_review"] is True
    assert receipt["category"] == "Groceries"
    assert receipt["category_source"] == "claude"
    assert receipt["line_items"] == []


def test_extract_requires_file(client):
    res = client.post("/v1/extract", headers=AUTH)
    assert res.status_code == 422
    assert res.get_json()["error"]["code"] == "validation_error"


def test_extract_rejects_empty_file(client):
    res = upload(client, data=b"")
    assert res.status_code == 422


@pytest.mark.parametrize(
    "exc,status,code",
    [
        (UnsupportedFileType("HEIC photos aren't supported."), 415, "unsupported_file_type"),
        (FileTooLarge("too big"), 413, "file_too_large"),
        (ExtractionError("secret internal detail"), 502, "extraction_failed"),
        (RuntimeError("secret internal detail"), 500, "internal"),
    ],
)
def test_extract_error_mapping(client, monkeypatch, exc, status, code):
    stub_extract_error(monkeypatch, exc)
    res = upload(client)
    assert res.status_code == status
    error = res.get_json()["error"]
    assert error["code"] == code
    assert "secret internal detail" not in error["message"]


def test_upload_over_15mb_is_413(client):
    res = upload(client, data=b"\x00" * (16 * 1024 * 1024))
    assert res.status_code == 413
    assert res.get_json()["error"]["code"] == "file_too_large"


def test_unknown_route_is_json_404(client):
    res = client.get("/v1/nope", headers=AUTH)
    assert res.status_code == 404
    assert res.get_json()["error"]["code"] == "not_found"


def test_app_refuses_to_start_without_token(monkeypatch):
    monkeypatch.delenv("API_TOKEN", raising=False)
    monkeypatch.setattr(app_module, "load_dotenv", lambda: None)
    with pytest.raises(RuntimeError, match="API_TOKEN"):
        app_module.create_app()
