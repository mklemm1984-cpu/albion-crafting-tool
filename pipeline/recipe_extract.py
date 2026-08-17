"""Extracts craftable-item recipe rows from the parsed ao-bin-dumps item
data. See docs/MECHANICS_SOURCE.md §3.1/§10 for the dict-or-list and
recipe-variant rules this module implements."""

from __future__ import annotations


def normalize_to_list(value):
    """items.json encodes many fields as dict-or-list depending on whether
    there's one or multiple entries. Normalize both to a list."""
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def select_standard_variant(crafting_requirements):
    """craftingrequirements is dict-or-list of recipe variants. Pick the
    first variant whose materials contain no faction/token resources."""
    variants = normalize_to_list(crafting_requirements)
    for variant in variants:
        resources = normalize_to_list(variant.get("craftresource"))
        if not any(
            "FACTION" in r["@uniquename"] or "TOKEN" in r["@uniquename"]
            for r in resources
        ):
            return variant
    return None


def compute_item_value(item, variant, iv_lookup):
    """Item value used for the station fee. Refined resources/raws expose
    @itemvalue directly; equipment/consumables sum their ingredients'
    item values (approximate for consumables, per MECHANICS_SOURCE.md §2.5).
    Returns (value, is_estimate).
    """
    direct = item.get("@itemvalue")
    if direct is not None:
        return float(direct), False

    resources = normalize_to_list(variant.get("craftresource"))
    total = 0.0
    for r in resources:
        mat_id = r["@uniquename"]
        count = float(r.get("@count", 1))
        total += iv_lookup.get(mat_id, 0.0) * count
    return total, True
