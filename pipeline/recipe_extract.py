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


def resolve_english_name(unique_name, en_lookup, enchant=0):
    """Resolve the EN-US localized name. Enchant rows use the base item's
    name with a '.k' suffix (e.g. "Adept's Scholar Cowl .1")."""
    base_name = en_lookup.get(unique_name, unique_name)
    if enchant:
        return f"{base_name} .{enchant}"
    return base_name


def extract_base_row(item, category, iv_lookup, en_lookup):
    """Extract the base (.0) recipe row for a craftable item. Returns None
    if the item has no craftingrequirements (uncraftable)."""
    crafting_requirements = item.get("craftingrequirements")
    if not crafting_requirements:
        return None
    variant = select_standard_variant(crafting_requirements)
    if variant is None:
        return None

    resources = normalize_to_list(variant.get("craftresource"))
    materials = [
        {"id": r["@uniquename"], "count": float(r.get("@count", 1))}
        for r in resources
    ]
    item_value, is_estimate = compute_item_value(item, variant, iv_lookup)
    unique_name = item["@uniquename"]

    return {
        "item_id": unique_name,
        "name": resolve_english_name(unique_name, en_lookup, enchant=0),
        "tier": int(item.get("@tier", 0)),
        "enchant": 0,
        "category": category,
        "shop_category": item.get("@shopcategory", ""),
        "shop_subcategory": item.get("@shopsubcategory1", ""),
        "output_amount": int(float(variant.get("@amountcrafted", 1))),
        "item_value": item_value,
        "item_value_is_estimate": is_estimate,
        "focus_cost": float(variant.get("@craftingfocus", 0) or 0),
        "materials": materials,
    }


def extract_enchant_rows_for_resource(base_item, enchant_items, category, iv_lookup, en_lookup):
    """Enchanted refined resources are separate simpleitems named
    T{tier}_{RES}_LEVEL{k}. `enchant_items` maps level (1-4) -> that item's
    dict, already looked up by the caller from the full item catalog."""
    rows = []
    for level, enchant_item in sorted(enchant_items.items()):
        row = extract_base_row(enchant_item, category, iv_lookup, en_lookup)
        if row is None:
            continue
        row["enchant"] = level
        row["item_id"] = base_item["@uniquename"] + f"_LEVEL{level}"
        row["name"] = resolve_english_name(base_item["@uniquename"], en_lookup, enchant=level)
        rows.append(row)
    return rows


def extract_enchant_rows_for_equipment(base_item, category, iv_lookup, en_lookup):
    """Enchanted equipment/consumables/mounts live under
    enchantments.enchantment[], each with its own craftingrequirements using
    the enchanted resource."""
    rows = []
    enchantments = normalize_to_list(
        (base_item.get("enchantments") or {}).get("enchantment")
    )
    for ench in enchantments:
        level = int(ench.get("@enchantmentlevel", 0))
        if level == 0:
            continue
        crafting_requirements = ench.get("craftingrequirements")
        if not crafting_requirements:
            continue
        variant = select_standard_variant(crafting_requirements)
        if variant is None:
            continue
        resources = normalize_to_list(variant.get("craftresource"))
        materials = [
            {"id": r["@uniquename"], "count": float(r.get("@count", 1))}
            for r in resources
        ]
        item_value, is_estimate = compute_item_value(base_item, variant, iv_lookup)
        unique_name = base_item["@uniquename"]
        rows.append({
            "item_id": f"{unique_name}@{level}",
            "name": resolve_english_name(unique_name, en_lookup, enchant=level),
            "tier": int(base_item.get("@tier", 0)),
            "enchant": level,
            "category": category,
            "shop_category": base_item.get("@shopcategory", ""),
            "shop_subcategory": base_item.get("@shopsubcategory1", ""),
            "output_amount": int(float(variant.get("@amountcrafted", 1))),
            "item_value": item_value,
            "item_value_is_estimate": is_estimate,
            "focus_cost": float(variant.get("@craftingfocus", 0) or 0),
            "materials": materials,
        })
    return rows
