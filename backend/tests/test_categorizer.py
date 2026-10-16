"""Characterization tests for the rule-based categorizer.

These lock in the current behavior of categorizer.py + categories.json,
including known quirks, so later refactors can't silently change results.
"""

import json
from pathlib import Path

import pytest

import categorizer

RULES_FILE = Path(categorizer.__file__).with_name("categories.json")
DATA = json.loads(RULES_FILE.read_text(encoding="utf-8"))


def test_categories_loaded_from_json():
    assert categorizer.CATEGORIES == DATA["categories"]
    assert categorizer.DEFAULT_CATEGORY == "Other"


def test_every_rule_targets_a_known_category():
    for keyword, category in DATA["rules"].items():
        assert category in categorizer.CATEGORIES, keyword


@pytest.mark.parametrize("keyword,category", sorted(DATA["rules"].items()))
def test_each_keyword_maps_to_its_category(keyword, category):
    assert categorizer.categorize_by_rules(keyword) == category


@pytest.mark.parametrize(
    "vendor,expected",
    [
        ("Starbucks Store #123", "Food & Drink"),
        ("STARBUCKS", "Food & Drink"),
        ("Trader Joe's #451", "Groceries"),
        ("Shell Oil", "Transportation"),
        ("Uber Eats", "Food & Drink"),  # longest keyword beats "uber"
        ("Uber Trip", "Transportation"),
        ("Amazon Web Services", "Software & Subscriptions"),  # beats "amazon"
        ("Amazon.com", "Shopping"),
        ("AT&T Wireless", "Utilities"),
    ],
)
def test_vendor_examples(vendor, expected):
    assert categorizer.categorize_by_rules(vendor) == expected


@pytest.mark.parametrize(
    "vendor,expected",
    [
        # Known quirk: plain substring matching, no word boundaries.
        ("Shellfish Shack", "Transportation"),
        ("Huber's Butcher", "Transportation"),
        ("Rinaldi's Pizza", "Groceries"),
    ],
)
def test_substring_quirks_are_preserved(vendor, expected):
    assert categorizer.categorize_by_rules(vendor) == expected


@pytest.mark.parametrize("vendor", [None, "", "Joe's Hardware"])
def test_no_match_returns_none(vendor):
    assert categorizer.categorize_by_rules(vendor) is None
