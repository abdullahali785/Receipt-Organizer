"""Google Sheets storage helper (gspread).

Appends one row per receipt: timestamp, date, vendor, amount, currency,
category, a manual-review flag, the review reason, and the source filename.

Two authentication modes (auto-detected):

  * service_account — a downloaded service-account JSON key
      (GOOGLE_SERVICE_ACCOUNT_FILE, default credentials.json). Requires sharing
      the sheet with the service account's client_email.

  * oauth — sign in as yourself with an OAuth "Desktop app" client
      (GOOGLE_OAUTH_CLIENT_FILE, default oauth_client.json). Use this when your
      org blocks service-account key creation. No sheet sharing needed — it runs
      as the Google account that authorizes it. A token is cached in
      GOOGLE_OAUTH_TOKEN_FILE (default authorized_user.json) after the first run.

Config comes from environment variables (see .env.example). Set
GOOGLE_AUTH_MODE to force a mode; default "auto" prefers a service-account file
if present, otherwise falls back to OAuth.

Run standalone to verify connectivity (appends a clearly-marked TEST row):

    python sheets.py
"""

from __future__ import annotations

import os
from datetime import datetime
from typing import List, Optional

import gspread
from google.oauth2.service_account import Credentials
from gspread.exceptions import APIError, SpreadsheetNotFound, WorksheetNotFound

# Least-privilege scope: reading/writing spreadsheets we already know the ID of.
_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

HEADER = [
    "Logged At",
    "Date",
    "Vendor",
    "Amount",
    "Currency",
    "Category",
    "Needs Review",
    "Review Reason",
    "Source File",
]


class SheetsError(RuntimeError):
    """Raised for any configuration or Google Sheets API failure, with an
    actionable message."""


# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #

def _sheet_id() -> Optional[str]:
    return os.getenv("GOOGLE_SHEET_ID") or None


def _service_account_file() -> str:
    return os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE", "credentials.json")


def _oauth_client_file() -> str:
    return os.getenv("GOOGLE_OAUTH_CLIENT_FILE", "oauth_client.json")


def _oauth_token_file() -> str:
    return os.getenv("GOOGLE_OAUTH_TOKEN_FILE", "authorized_user.json")


def _worksheet_name() -> str:
    return os.getenv("GOOGLE_SHEET_WORKSHEET", "Sheet1")


def _has_credentials() -> bool:
    return os.path.isfile(_service_account_file()) or os.path.isfile(_oauth_client_file())


def is_configured() -> bool:
    """True if a sheet ID and some form of credentials are present."""
    return bool(_sheet_id()) and _has_credentials()


# --------------------------------------------------------------------------- #
# Authorization
# --------------------------------------------------------------------------- #

def _authorize() -> "gspread.client.Client":
    """Build an authorized gspread client via a service-account key or OAuth."""
    mode = os.getenv("GOOGLE_AUTH_MODE", "auto").lower()
    sa_file = _service_account_file()
    oauth_file = _oauth_client_file()

    use_sa = mode == "service_account" or (mode == "auto" and os.path.isfile(sa_file))
    use_oauth = mode == "oauth" or (
        mode == "auto" and not use_sa and os.path.isfile(oauth_file)
    )

    if use_sa:
        if not os.path.isfile(sa_file):
            raise SheetsError(
                f"GOOGLE_AUTH_MODE=service_account but no key file at '{sa_file}'."
            )
        try:
            creds = Credentials.from_service_account_file(sa_file, scopes=_SCOPES)
            return gspread.authorize(creds)
        except Exception as exc:  # noqa: BLE001 - surface credential-load errors cleanly
            raise SheetsError(f"Could not load service-account key: {exc}") from exc

    if use_oauth:
        if not os.path.isfile(oauth_file):
            raise SheetsError(
                f"GOOGLE_AUTH_MODE=oauth but no OAuth client file at '{oauth_file}'."
            )
        try:
            # First run opens a browser to authorize; the token is then cached.
            return gspread.oauth(
                scopes=_SCOPES,
                credentials_filename=oauth_file,
                authorized_user_filename=_oauth_token_file(),
            )
        except Exception as exc:  # noqa: BLE001 - browser/consent flow can fail
            raise SheetsError(f"OAuth authorization failed: {exc}") from exc

    raise SheetsError(
        "No Google credentials found. Provide EITHER a service-account key at "
        f"'{sa_file}' OR an OAuth client secret at '{oauth_file}'. See .env.example."
    )


# --------------------------------------------------------------------------- #
# Worksheet access
# --------------------------------------------------------------------------- #

def get_worksheet() -> "gspread.Worksheet":
    """Open (or create) the target worksheet, raising SheetsError with guidance
    on the common misconfigurations."""
    sheet_id = _sheet_id()
    if not sheet_id:
        raise SheetsError(
            "GOOGLE_SHEET_ID is not set. Add it to your .env (the long id in the "
            "sheet URL: docs.google.com/spreadsheets/d/<THIS>/edit)."
        )

    client = _authorize()

    try:
        spreadsheet = client.open_by_key(sheet_id)
    except SpreadsheetNotFound as exc:
        raise SheetsError(
            f"Sheet '{sheet_id}' not found or not accessible. Confirm the ID. "
            "(Service-account mode: share the sheet with the account's "
            "client_email as Editor. OAuth mode: sign in as an account that can "
            "edit the sheet.)"
        ) from exc
    except APIError as exc:
        raise SheetsError(_explain_api_error(exc)) from exc

    name = _worksheet_name()
    try:
        return spreadsheet.worksheet(name)
    except WorksheetNotFound:
        return spreadsheet.add_worksheet(title=name, rows=1000, cols=len(HEADER))


def append_receipt(receipt, category: str, source_filename: str, *, worksheet=None) -> List:
    """Append one receipt row to the sheet. Returns the row values written.

    `receipt` is an agent.Receipt; `category` the chosen category string.
    """
    ws = worksheet or get_worksheet()
    _ensure_header(ws)

    row = [
        datetime.now().isoformat(timespec="seconds"),
        receipt.date or "",
        receipt.vendor or "",
        receipt.total_amount if receipt.total_amount is not None else "",
        receipt.currency or "",
        category,
        "YES" if receipt.needs_review else "",
        receipt.review_reason or "",
        source_filename,
    ]

    try:
        ws.append_row(row, value_input_option="USER_ENTERED")
    except APIError as exc:
        raise SheetsError(_explain_api_error(exc)) from exc
    return row


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _ensure_header(ws) -> None:
    """Add the header row if the worksheet is empty. Never clobbers an existing
    first row (in case the user manages their own header)."""
    if not ws.row_values(1):
        ws.append_row(HEADER, value_input_option="USER_ENTERED")


def _explain_api_error(exc: APIError) -> str:
    text = str(exc)
    if "PERMISSION_DENIED" in text or "does not have permission" in text:
        return (
            "Permission denied. In service-account mode, share the sheet with the "
            "account's client_email (Editor). In OAuth mode, authorize with an "
            "account that can edit the sheet."
        )
    if "has not been used" in text or "SERVICE_DISABLED" in text or "API has not" in text:
        return (
            "The Google Sheets API is not enabled for this project. Enable it in "
            "the Google Cloud console, then retry."
        )
    return f"Google Sheets API error: {text}"


# --------------------------------------------------------------------------- #
# Standalone connectivity test
# --------------------------------------------------------------------------- #

if __name__ == "__main__":
    from dotenv import load_dotenv

    load_dotenv()

    try:
        ws = get_worksheet()
        _ensure_header(ws)
        ws.append_row(
            [
                datetime.now().isoformat(timespec="seconds"),
                "2026-01-01",
                "TEST — sheets.py connectivity check",
                0,
                "USD",
                "Other",
                "",
                "",
                "(test row — safe to delete)",
            ],
            value_input_option="USER_ENTERED",
        )
        print(f"OK: appended a test row to sheet {_sheet_id()} (tab '{_worksheet_name()}').")
        print("Open the sheet to confirm, then delete the test row.")
    except SheetsError as err:
        print(f"Sheets error: {err}")
        raise SystemExit(1)
