"""Characterization tests for agent.py extraction + categorization.

Claude is replaced by a fake client, so these run offline and for free.
"""

import json
from types import SimpleNamespace

import anthropic
import httpx
import pytest

import agent
import categorizer
from agent import (
    ExtractionError,
    FileTooLarge,
    LineItem,
    Receipt,
    UnsupportedFileType,
    categorize,
    extract_receipt,
    extract_receipt_bytes,
)

JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 32
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
PDF_BYTES = b"%PDF-1.4\n" + b"\x00" * 32

SAMPLE = Receipt(
    vendor="Whole Foods Market",
    date="2026-07-01",
    total_amount=42.10,
    currency="USD",
    line_items=[LineItem(description="Apples", amount=3.99)],
    confidence="high",
    needs_review=False,
)


class FakeMessages:
    """Stands in for client.messages. Each entry in `outcomes` is returned
    (or raised, if it's an exception) for one call, in order."""

    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = []

    def _next(self, kwargs):
        self.calls.append(kwargs)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    def parse(self, **kwargs):
        return self._next(kwargs)

    def create(self, **kwargs):
        return self._next(kwargs)


def fake_client(*outcomes):
    return SimpleNamespace(messages=FakeMessages(outcomes))


def parsed(receipt, stop_reason="end_turn"):
    return SimpleNamespace(stop_reason=stop_reason, parsed_output=receipt)


def category_response(category, stop_reason="end_turn"):
    block = SimpleNamespace(type="text", text=json.dumps({"category": category}))
    return SimpleNamespace(stop_reason=stop_reason, content=[block])


@pytest.fixture(autouse=True)
def no_mock_mode(monkeypatch):
    monkeypatch.delenv("MOCK_EXTRACTION", raising=False)


@pytest.fixture
def jpg(tmp_path):
    path = tmp_path / "receipt.jpg"
    path.write_bytes(JPEG_BYTES)
    return path


# --------------------------------------------------------------------------- #
# extract_receipt
# --------------------------------------------------------------------------- #

def test_extract_returns_parsed_receipt(jpg):
    client = fake_client(parsed(SAMPLE))
    assert extract_receipt(jpg, client=client) == SAMPLE


def test_extract_request_shape(jpg):
    client = fake_client(parsed(SAMPLE))
    extract_receipt(jpg, client=client)

    (call,) = client.messages.calls
    assert call["model"] == agent.DEFAULT_MODEL
    assert call["system"] == agent.SYSTEM_PROMPT
    assert call["output_format"] is Receipt
    image, text = call["messages"][0]["content"]
    assert image["type"] == "image"
    assert image["source"]["media_type"] == "image/jpeg"
    assert text == {"type": "text", "text": agent._USER_INSTRUCTION}


@pytest.mark.parametrize(
    "name,data,block_type,media_type",
    [
        ("r.png", PNG_BYTES, "image", "image/png"),
        ("r.JPEG", JPEG_BYTES, "image", "image/jpeg"),
        ("r.pdf", PDF_BYTES, "document", "application/pdf"),
    ],
)
def test_media_block_by_type(tmp_path, name, data, block_type, media_type):
    path = tmp_path / name
    path.write_bytes(data)
    block = agent._build_media_block(path)
    assert block["type"] == block_type
    assert block["source"]["media_type"] == media_type
    assert block["source"]["type"] == "base64"


def test_extract_rejects_unsupported_type_without_calling_claude(tmp_path):
    path = tmp_path / "receipt.txt"
    path.write_text("hello")
    client = fake_client()
    with pytest.raises(UnsupportedFileType):
        extract_receipt(path, client=client)
    assert client.messages.calls == []


def test_extract_missing_file(tmp_path):
    with pytest.raises(UnsupportedFileType):
        extract_receipt(tmp_path / "nope.jpg", client=fake_client())


def test_extract_retries_once_then_succeeds(jpg):
    client = fake_client(RuntimeError("transient"), parsed(SAMPLE))
    assert extract_receipt(jpg, client=client) == SAMPLE
    assert len(client.messages.calls) == 2


def test_extract_gives_up_after_retries(jpg):
    client = fake_client(RuntimeError("boom"), RuntimeError("boom"))
    with pytest.raises(ExtractionError):
        extract_receipt(jpg, client=client)


def test_extract_refusal_raises_without_retry(jpg):
    client = fake_client(parsed(None, "refusal"))
    with pytest.raises(ExtractionError):
        extract_receipt(jpg, client=client)
    assert len(client.messages.calls) == 1


def test_extract_client_error_is_not_retried(jpg):
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    bad = anthropic.BadRequestError(
        "image too big", response=httpx.Response(400, request=request), body=None
    )
    client = fake_client(bad)
    with pytest.raises(ExtractionError):
        extract_receipt(jpg, client=client)
    assert len(client.messages.calls) == 1


# --------------------------------------------------------------------------- #
# extract_receipt_bytes / file sniffing
# --------------------------------------------------------------------------- #

@pytest.mark.parametrize(
    "data,media_type",
    [
        (JPEG_BYTES, "image/jpeg"),
        (PNG_BYTES, "image/png"),
        (b"GIF89a" + b"\x00" * 16, "image/gif"),
        (b"RIFF\x00\x00\x00\x00WEBPVP8 ", "image/webp"),
        (PDF_BYTES, "application/pdf"),
    ],
)
def test_detect_media_type(data, media_type):
    assert agent.detect_media_type(data) == media_type


def test_extension_is_ignored_in_favor_of_content(tmp_path):
    path = tmp_path / "actually-a-png.jpg"
    path.write_bytes(PNG_BYTES)
    assert agent._build_media_block(path)["source"]["media_type"] == "image/png"


def test_heic_is_rejected_with_a_clear_message():
    heic = b"\x00\x00\x00\x18ftypheic" + b"\x00" * 16
    with pytest.raises(UnsupportedFileType, match="HEIC"):
        extract_receipt_bytes(heic, client=fake_client())


def test_unknown_bytes_rejected():
    with pytest.raises(UnsupportedFileType):
        extract_receipt_bytes(b"hello world", client=fake_client())


def test_oversized_image_rejected_before_calling_claude():
    client = fake_client()
    big = JPEG_BYTES + b"\x00" * agent.MAX_IMAGE_BYTES
    with pytest.raises(FileTooLarge):
        extract_receipt_bytes(big, client=client)
    assert client.messages.calls == []


def test_pdf_has_a_higher_limit():
    pdf = PDF_BYTES + b"\x00" * agent.MAX_IMAGE_BYTES
    receipt = extract_receipt_bytes(pdf, client=fake_client(parsed(SAMPLE)))
    assert receipt == SAMPLE


def test_extract_bytes_returns_parsed_receipt():
    client = fake_client(parsed(SAMPLE))
    assert extract_receipt_bytes(PNG_BYTES, client=client) == SAMPLE
    image, _ = client.messages.calls[0]["messages"][0]["content"]
    assert image["source"]["media_type"] == "image/png"


def test_extract_empty_output_raises(jpg):
    client = fake_client(parsed(None), parsed(None))
    with pytest.raises(ExtractionError):
        extract_receipt(jpg, client=client)


def test_mock_mode_skips_claude(jpg, monkeypatch):
    monkeypatch.setenv("MOCK_EXTRACTION", "1")
    client = fake_client()
    receipt = extract_receipt(jpg, client=client)
    assert receipt.vendor == "Starbucks"
    assert receipt.total_amount == 8.75
    assert client.messages.calls == []


def test_receipt_defaults_are_cautious():
    r = Receipt()
    assert r.confidence == "low"
    assert r.needs_review is True
    assert r.line_items == []


# --------------------------------------------------------------------------- #
# categorize
# --------------------------------------------------------------------------- #

def test_categorize_rule_hit_skips_claude():
    client = fake_client()
    result = categorize("Starbucks #12", [], client=client)
    assert (result.category, result.source) == ("Food & Drink", "rule")
    assert client.messages.calls == []


def test_categorize_falls_back_to_claude():
    client = fake_client(category_response("Office Supplies"))
    items = [LineItem(description="Printer paper", amount=9.99)]
    result = categorize("Joe's Hardware", items, client=client)
    assert (result.category, result.source) == ("Office Supplies", "claude")

    (call,) = client.messages.calls
    schema = call["output_config"]["format"]["schema"]
    assert schema["properties"]["category"]["enum"] == categorizer.CATEGORIES
    assert "Joe's Hardware" in call["messages"][0]["content"]
    assert "Printer paper" in call["messages"][0]["content"]


def test_categorize_claude_error_degrades_to_default():
    client = fake_client(RuntimeError("api down"))
    result = categorize("Joe's Hardware", [], client=client)
    assert (result.category, result.source) == ("Other", "default")


def test_categorize_refusal_degrades_to_default():
    client = fake_client(category_response("Other", stop_reason="refusal"))
    result = categorize("Joe's Hardware", [], client=client)
    assert (result.category, result.source) == ("Other", "default")
