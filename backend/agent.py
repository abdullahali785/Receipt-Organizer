"""Core agent logic: extract structured data from a receipt image/PDF using
Claude's vision capability, and categorize the expense (rules first, Claude as
fallback). Returns strict, schema-validated data.

Sheets writing lives in sheets.py; the keyword rules live in categorizer.py /
categories.json. This module owns everything that talks to Claude.

Run standalone to test extraction + categorization on a single file:

    python agent.py path/to/receipt.jpg
"""

from __future__ import annotations

import base64
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import List, Literal, Optional

import anthropic
from pydantic import BaseModel, Field

import categorizer

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #

DEFAULT_MODEL = os.getenv("CLAUDE_MODEL", "claude-opus-4-8")

# Extension -> media type for image inputs. PDFs are handled separately.
_IMAGE_MEDIA_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
}
SUPPORTED_EXTENSIONS = set(_IMAGE_MEDIA_TYPES) | {".pdf"}


# --------------------------------------------------------------------------- #
# Errors
# --------------------------------------------------------------------------- #

class UnsupportedFileType(ValueError):
    """Raised when the uploaded file is not an image or PDF we can read."""


class ExtractionError(RuntimeError):
    """Raised when Claude cannot return usable structured data."""


class CategorizationError(RuntimeError):
    """Raised when the Claude categorization fallback fails."""


# --------------------------------------------------------------------------- #
# Extraction schema (also the JSON schema Claude is constrained to)
# --------------------------------------------------------------------------- #

class LineItem(BaseModel):
    description: str = Field(description="The item or service purchased.")
    amount: Optional[float] = Field(
        default=None,
        description="Line price as a number, no currency symbol. Null if not legible.",
    )


class Receipt(BaseModel):
    """Structured receipt data. Fields are nullable on purpose: Claude is told
    to return null rather than guess when a value can't be read confidently."""

    vendor: Optional[str] = Field(
        default=None, description="Merchant / business name (not the cardholder)."
    )
    date: Optional[str] = Field(
        default=None, description="Transaction date normalized to ISO 8601 (YYYY-MM-DD)."
    )
    total_amount: Optional[float] = Field(
        default=None,
        description="Final grand total paid (after tax/tip), as a number with no symbol.",
    )
    currency: Optional[str] = Field(
        default=None, description="ISO 4217 currency code, e.g. USD, EUR, GBP."
    )
    line_items: List[LineItem] = Field(
        default_factory=list, description="Purchased items, when legible."
    )
    confidence: Literal["high", "medium", "low"] = Field(
        default="low", description="Overall confidence in the extracted values."
    )
    needs_review: bool = Field(
        default=True,
        description="True if any key field is missing/uncertain or confidence is low.",
    )
    review_reason: Optional[str] = Field(
        default=None, description="Short note on why review is needed, if it is."
    )


# --------------------------------------------------------------------------- #
# Prompts
# --------------------------------------------------------------------------- #

SYSTEM_PROMPT = """\
You are a meticulous receipt data extractor. You are given a photo or scan of a \
receipt (often messy, rotated, low-resolution, or partially cut off) and must \
extract structured fields.

Rules:
- vendor: the merchant / business name printed on the receipt, not the customer.
- date: the transaction date, normalized to ISO 8601 (YYYY-MM-DD). Interpret \
partial or localized formats sensibly. If the year is missing or the date is \
unreadable, set it to null.
- total_amount: the FINAL grand total actually paid (after tax and tip), as a \
plain number with no currency symbol or thousands separators. Do not use a \
subtotal if a later total is present.
- currency: the ISO 4217 code (USD, EUR, GBP, ...). Infer from the currency \
symbol or country context. If genuinely ambiguous, set it to null.
- line_items: each purchased item with its description and price, when legible. \
An empty list is fine and is NOT by itself a reason for review.
- confidence: "high" only when the key fields (vendor, date, total) are clearly \
legible; "medium" when some fields required inference; "low" when the image is \
rotated, blurry, handwritten, or partially unreadable.
- needs_review: set true when confidence is "low" OR any of vendor, date, or \
total_amount is null or uncertain.
- review_reason: one short sentence explaining what was unclear, when \
needs_review is true. Otherwise null.

Never invent values. When you cannot read a field confidently, use null and \
flag the receipt for review rather than guessing."""

_USER_INSTRUCTION = (
    "Extract the structured receipt data from this document. Flag it for review "
    "instead of guessing if anything important is unclear."
)


# --------------------------------------------------------------------------- #
# Extraction
# --------------------------------------------------------------------------- #

def extract_receipt(
    file_path: str | os.PathLike,
    *,
    model: Optional[str] = None,
    max_retries: int = 1,
    client: Optional[anthropic.Anthropic] = None,
) -> Receipt:
    """Extract structured data from a receipt image or PDF.

    Uses Claude's vision + structured outputs, so the returned object is always
    schema-valid. Retries once on a transient/malformed response.

    Raises UnsupportedFileType for non-image/PDF inputs, and ExtractionError if
    Claude cannot produce usable data after the retries.
    """
    media_block = _build_media_block(file_path)  # validates the file type

    # Offline demo path: exercise the full UI + categorizer + Sheets flow without
    # calling (or paying for) the API. Enable with MOCK_EXTRACTION=1.
    if _mock_enabled():
        return _mock_receipt()

    client = client or anthropic.Anthropic()
    model = model or DEFAULT_MODEL

    messages = [
        {
            "role": "user",
            "content": [media_block, {"type": "text", "text": _USER_INSTRUCTION}],
        }
    ]

    last_error: Optional[Exception] = None
    for _attempt in range(max_retries + 1):
        try:
            response = client.messages.parse(
                model=model,
                max_tokens=4096,
                system=SYSTEM_PROMPT,
                messages=messages,
                output_format=Receipt,
            )
            if response.stop_reason == "refusal":
                raise ExtractionError("Claude declined to process this document.")
            receipt = response.parsed_output
            if receipt is None:
                raise ExtractionError("Claude returned no parseable structured output.")
            return receipt
        except Exception as exc:  # noqa: BLE001 - retry any transient failure once
            last_error = exc

    raise ExtractionError(
        f"Extraction failed after {max_retries + 1} attempt(s): {last_error}"
    ) from last_error


# --------------------------------------------------------------------------- #
# Categorization: rules first (categorizer.py), Claude as fallback
# --------------------------------------------------------------------------- #

@dataclass
class Categorization:
    category: str
    source: Literal["rule", "claude", "default"]


def categorize(
    vendor: Optional[str],
    line_items: Optional[List[LineItem]] = None,
    *,
    model: Optional[str] = None,
    client: Optional[anthropic.Anthropic] = None,
) -> Categorization:
    """Assign a category. Tries the editable keyword rules first; if none match,
    asks Claude to pick from the valid categories. Falls back to the default
    category if the Claude call fails so categorization never crashes a receipt.
    """
    rule_hit = categorizer.categorize_by_rules(vendor)
    if rule_hit:
        return Categorization(rule_hit, "rule")

    try:
        category = categorize_with_claude(
            vendor, line_items or [], categorizer.CATEGORIES, model=model, client=client
        )
        return Categorization(category, "claude")
    except Exception:  # noqa: BLE001 - degrade to default rather than fail the row
        return Categorization(categorizer.DEFAULT_CATEGORY, "default")


def categorize_with_claude(
    vendor: Optional[str],
    line_items: List[LineItem],
    categories: List[str],
    *,
    model: Optional[str] = None,
    client: Optional[anthropic.Anthropic] = None,
) -> str:
    """Ask Claude to choose exactly one of `categories` for this expense.

    Uses structured outputs with an enum, so the returned value is guaranteed to
    be one of the provided categories.
    """
    client = client or anthropic.Anthropic()
    model = model or DEFAULT_MODEL

    items = ", ".join(li.description for li in line_items if li.description) or "(none listed)"
    prompt = (
        "Categorize this business expense into exactly one of the allowed "
        "categories, based on the vendor and line items.\n\n"
        f"Vendor: {vendor or 'Unknown'}\n"
        f"Line items: {items}"
    )
    schema = {
        "type": "object",
        "properties": {"category": {"type": "string", "enum": categories}},
        "required": ["category"],
        "additionalProperties": False,
    }

    response = client.messages.create(
        model=model,
        max_tokens=256,
        messages=[{"role": "user", "content": prompt}],
        output_config={"format": {"type": "json_schema", "schema": schema}},
    )
    if response.stop_reason == "refusal":
        raise CategorizationError("Claude declined to categorize this expense.")

    text = next((b.text for b in response.content if b.type == "text"), None)
    if not text:
        raise CategorizationError("Claude returned no category.")
    return json.loads(text)["category"]


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _mock_enabled() -> bool:
    return os.getenv("MOCK_EXTRACTION", "").strip().lower() in ("1", "true", "yes", "on")


def _mock_receipt() -> Receipt:
    """A canned sample receipt for offline demoing (MOCK_EXTRACTION=1)."""
    return Receipt(
        vendor="Starbucks",
        date="2026-07-28",
        total_amount=8.75,
        currency="USD",
        line_items=[
            LineItem(description="Grande Latte", amount=5.25),
            LineItem(description="Blueberry Muffin", amount=3.50),
        ],
        confidence="high",
        needs_review=False,
        review_reason=None,
    )


def _build_media_block(file_path: str | os.PathLike) -> dict:
    """Build the image/document content block for the Messages API."""
    path = Path(file_path)
    if not path.is_file():
        raise UnsupportedFileType(f"File not found: {path}")

    ext = path.suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        supported = ", ".join(sorted(SUPPORTED_EXTENSIONS))
        raise UnsupportedFileType(
            f"Unsupported file type '{ext or path.name}'. Supported: {supported}"
        )

    data_b64 = base64.standard_b64encode(path.read_bytes()).decode("ascii")

    if ext == ".pdf":
        return {
            "type": "document",
            "source": {
                "type": "base64",
                "media_type": "application/pdf",
                "data": data_b64,
            },
        }

    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": _IMAGE_MEDIA_TYPES[ext],
            "data": data_b64,
        },
    }


# --------------------------------------------------------------------------- #
# Standalone test entry point
# --------------------------------------------------------------------------- #

if __name__ == "__main__":
    import sys

    from dotenv import load_dotenv

    load_dotenv()

    if len(sys.argv) != 2:
        print("Usage: python agent.py <path-to-receipt-image-or-pdf>")
        raise SystemExit(1)

    try:
        receipt = extract_receipt(sys.argv[1])
        category = categorize(receipt.vendor, receipt.line_items)
    except (UnsupportedFileType, ExtractionError) as err:
        print(f"Error: {err}")
        raise SystemExit(1)

    output = receipt.model_dump()
    output["category"] = category.category
    output["category_source"] = category.source
    print(json.dumps(output, indent=2))
