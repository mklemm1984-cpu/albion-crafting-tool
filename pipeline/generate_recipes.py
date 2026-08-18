"""Generates app/public/data/recipes.json (full catalog) and
app/public/data/recipes_core.json (a small subset for fast iteration) from
the ao-bin-dumps item data.

Usage:
    python generate_recipes.py [--refresh]
"""

from __future__ import annotations

import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from download import load_items, load_localized_names  # noqa: E402
from recipe_extract import (  # noqa: E402
    extract_base_row,
    extract_enchant_rows_for_equipment,
    extract_enchant_rows_for_resource,
    normalize_to_list,
)

DATA_DIR = pathlib.Path(__file__).parent.parent / "app" / "public" / "data"
CRAFTABLE_CATEGORIES = ["simpleitem", "equipmentitem", "weapon", "consumableitem", "mount"]

# Matches the exact T{tier}_{RES}_LEVELk sibling suffix (k in 1-4) that
# find_resource_enchant_siblings looks for -- anchored so ids that merely
# contain the substring "_LEVEL" for unrelated reasons aren't caught.
_LEVEL_SUFFIX_RE = re.compile(r"_LEVEL[1-4]$")

# Core subset from the original prototype: all 5 refining lines T2-T8 incl.
# .1-.4, the cloth armor set T4-T8 incl. enchants, and the heal potion line
# T4-T8. Used for fast iteration and as a smoke-test dataset.
CORE_ID_PREFIXES = (
    "T2_WOOD", "T3_WOOD", "T4_WOOD", "T5_WOOD", "T6_WOOD", "T7_WOOD", "T8_WOOD",
    "T2_PLANKS", "T3_PLANKS", "T4_PLANKS", "T5_PLANKS", "T6_PLANKS", "T7_PLANKS", "T8_PLANKS",
    "T2_ORE", "T3_ORE", "T4_ORE", "T5_ORE", "T6_ORE", "T7_ORE", "T8_ORE",
    "T2_METALBAR", "T3_METALBAR", "T4_METALBAR", "T5_METALBAR", "T6_METALBAR", "T7_METALBAR", "T8_METALBAR",
    "T2_FIBER", "T3_FIBER", "T4_FIBER", "T5_FIBER", "T6_FIBER", "T7_FIBER", "T8_FIBER",
    "T2_CLOTH", "T3_CLOTH", "T4_CLOTH", "T5_CLOTH", "T6_CLOTH", "T7_CLOTH", "T8_CLOTH",
    "T2_HIDE", "T3_HIDE", "T4_HIDE", "T5_HIDE", "T6_HIDE", "T7_HIDE", "T8_HIDE",
    "T2_LEATHER", "T3_LEATHER", "T4_LEATHER", "T5_LEATHER", "T6_LEATHER", "T7_LEATHER", "T8_LEATHER",
    "T2_ROCK", "T3_ROCK", "T4_ROCK", "T5_ROCK", "T6_ROCK", "T7_ROCK", "T8_ROCK",
    "T2_STONEBLOCK", "T3_STONEBLOCK", "T4_STONEBLOCK", "T5_STONEBLOCK", "T6_STONEBLOCK", "T7_STONEBLOCK", "T8_STONEBLOCK",
    "T4_HEAD_CLOTH_SET1", "T5_HEAD_CLOTH_SET1", "T6_HEAD_CLOTH_SET1", "T7_HEAD_CLOTH_SET1", "T8_HEAD_CLOTH_SET1",
    "T4_ARMOR_CLOTH_SET1", "T5_ARMOR_CLOTH_SET1", "T6_ARMOR_CLOTH_SET1", "T7_ARMOR_CLOTH_SET1", "T8_ARMOR_CLOTH_SET1",
    "T4_SHOES_CLOTH_SET1", "T5_SHOES_CLOTH_SET1", "T6_SHOES_CLOTH_SET1", "T7_SHOES_CLOTH_SET1", "T8_SHOES_CLOTH_SET1",
    "T4_POTION_HEAL", "T5_POTION_HEAL", "T6_POTION_HEAL", "T7_POTION_HEAL", "T8_POTION_HEAL",
)


def build_iv_lookup(simple_items: list) -> dict:
    lookup = {}
    for item in simple_items:
        if "@itemvalue" in item:
            lookup[item["@uniquename"]] = float(item["@itemvalue"])
    return lookup


def build_en_lookup(localized_names: list) -> dict:
    lookup = {}
    for entry in localized_names:
        name = entry.get("LocalizedNames", {}).get("EN-US")
        if name:
            lookup[entry["UniqueName"]] = name
    return lookup


def find_resource_enchant_siblings(base_item_id: str, simple_items_by_id: dict) -> dict:
    """For a base refined resource, finds any T{tier}_{RES}_LEVELk siblings
    among the other simpleitems and returns {level: item_dict}."""
    siblings = {}
    for level in (1, 2, 3, 4):
        candidate_id = f"{base_item_id}_LEVEL{level}"
        if candidate_id in simple_items_by_id:
            siblings[level] = simple_items_by_id[candidate_id]
    return siblings


def _is_attached_level_sibling(item_id: str, craftable_base_ids: set) -> bool:
    """True if item_id is a T{tier}_{RES}_LEVELk item whose base resource is
    itself craftable -- such items are skipped from top-level processing
    because they're already emitted as that base's enchant row. A LEVELk
    item whose base is missing or uncraftable falls through to normal
    top-level processing instead of silently vanishing."""
    match = _LEVEL_SUFFIX_RE.search(item_id)
    if not match:
        return False
    base_id = item_id[: match.start()]
    return base_id in craftable_base_ids


def generate(items_data: dict, localized_names: list) -> tuple[list, dict]:
    """Returns (rows, summary)."""
    simple_items = normalize_to_list(items_data.get("simpleitem"))
    iv_lookup = build_iv_lookup(simple_items)
    en_lookup = build_en_lookup(localized_names)
    simple_items_by_id = {i["@uniquename"]: i for i in simple_items}
    craftable_base_ids = {
        i["@uniquename"]
        for i in simple_items
        if not _LEVEL_SUFFIX_RE.search(i.get("@uniquename", "")) and i.get("craftingrequirements")
    }

    rows = []
    summary = {"per_category": {}, "skipped": []}

    for category in CRAFTABLE_CATEGORIES:
        items = normalize_to_list(items_data.get(category))
        if category == "simpleitem":
            # Enchanted refined resources (T{tier}_{RES}_LEVELk) are listed
            # as their own simpleitem entries in the dump, but when their
            # base resource is craftable, they're emitted as an enchant row
            # of that base (via find_resource_enchant_siblings) rather than
            # as a standalone base row, to avoid duplicate item_ids. A
            # LEVELk item whose base is missing/uncraftable is NOT excluded
            # here, so it still gets normal top-level processing.
            items = [
                i for i in items
                if not _is_attached_level_sibling(i.get("@uniquename", ""), craftable_base_ids)
            ]
        emitted = 0
        for item in items:
            item_id = item.get("@uniquename", "<unknown>")
            base_row = extract_base_row(item, category, iv_lookup, en_lookup)
            if base_row is None:
                summary["skipped"].append((item_id, "no craftingrequirements"))
                continue
            rows.append(base_row)
            emitted += 1

            if category == "simpleitem":
                siblings = find_resource_enchant_siblings(item_id, simple_items_by_id)
                enchant_rows = extract_enchant_rows_for_resource(
                    item, siblings, category, iv_lookup, en_lookup
                )
            else:
                enchant_rows = extract_enchant_rows_for_equipment(
                    item, category, iv_lookup, en_lookup
                )
            rows.extend(enchant_rows)
            emitted += len(enchant_rows)

        summary["per_category"][category] = emitted

    rows.sort(key=lambda r: (r["category"], r["tier"], r["item_id"], r["enchant"]))
    summary["total_rows"] = len(rows)
    summary["max_material_columns"] = max((len(r["materials"]) for r in rows), default=0)

    return rows, summary


def main(refresh: bool = False, data_dir: pathlib.Path = DATA_DIR) -> None:
    items_data = load_items(refresh)
    localized_names = load_localized_names(refresh)

    rows, summary = generate(items_data, localized_names)

    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "recipes.json").write_text(
        json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    core_rows = [
        r for r in rows
        if r["item_id"].split("_LEVEL")[0].split("@")[0] in CORE_ID_PREFIXES
    ]
    (data_dir / "recipes_core.json").write_text(
        json.dumps(core_rows, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    print(f"Wrote {len(rows)} rows to {data_dir / 'recipes.json'}")
    print(f"Wrote {len(core_rows)} rows to {data_dir / 'recipes_core.json'}")
    for category, count in summary["per_category"].items():
        print(f"  {category}: {count} rows")
    print(f"Max material columns: {summary['max_material_columns']}")
    print(f"Skipped {len(summary['skipped'])} items (no craftingrequirements)")


if __name__ == "__main__":
    main(refresh="--refresh" in sys.argv)
