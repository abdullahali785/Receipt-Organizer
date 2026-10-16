"""Rule-based expense categorization.

Rules live in categories.json (vendor keyword -> category) so you can expand
them without touching code. Matching is case-insensitive substring matching;
the longest matching keyword wins, so a specific rule like "uber eats" beats a
general one like "uber".

This module is deliberately Claude-free — the AI fallback for vendors that no
rule matches lives in agent.py (see agent.categorize).

Quick test from the shell:

    python categorizer.py "Starbucks Store #123"
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import List, Optional, Tuple

_RULES_PATH = Path(__file__).with_name("categories.json")


def _load() -> Tuple[List[str], List[Tuple[str, str]], str]:
    data = json.loads(_RULES_PATH.read_text(encoding="utf-8"))
    categories: List[str] = data["categories"]

    # Lowercase keys, sort by length descending so the most specific rule wins.
    rules = {str(k).lower(): v for k, v in data["rules"].items()}
    ordered = sorted(rules.items(), key=lambda kv: len(kv[0]), reverse=True)

    default = data.get("default_category") or ("Other" if "Other" in categories else categories[-1])
    return categories, ordered, default


CATEGORIES, _ORDERED_RULES, DEFAULT_CATEGORY = _load()


def categorize_by_rules(vendor: Optional[str]) -> Optional[str]:
    """Return the category for `vendor` by keyword match, or None if no rule
    matches (the caller should then fall back to Claude)."""
    if not vendor:
        return None
    haystack = vendor.lower()
    for keyword, category in _ORDERED_RULES:
        if keyword in haystack:
            return category
    return None


def reload_rules() -> None:
    """Re-read categories.json (handy after editing the rules at runtime)."""
    global CATEGORIES, _ORDERED_RULES, DEFAULT_CATEGORY
    CATEGORIES, _ORDERED_RULES, DEFAULT_CATEGORY = _load()


if __name__ == "__main__":
    import sys

    if len(sys.argv) != 2:
        print('Usage: python categorizer.py "<vendor name>"')
        raise SystemExit(1)

    match = categorize_by_rules(sys.argv[1])
    if match:
        print(f"{sys.argv[1]!r} -> {match}  (rule match)")
    else:
        print(f"{sys.argv[1]!r} -> no rule match (would fall back to Claude)")
