import json

T4_CLOTH_ITEM = {
    "@uniquename": "T4_CLOTH",
    "@tier": "4",
    "@itemvalue": "16",
    "@shopcategory": "crafting",
    "@shopsubcategory1": "refinedresources",
    "craftingrequirements": {
        "@craftingfocus": "54",
        "craftresource": [
            {"@uniquename": "T4_FIBER", "@count": "2"},
            {"@uniquename": "T3_CLOTH", "@count": "1"},
        ],
    },
}

T4_CLOTH_LEVEL1_ITEM = {
    "@uniquename": "T4_CLOTH_LEVEL1",
    "@tier": "4",
    "@itemvalue": "32",
    "@shopcategory": "crafting",
    "@shopsubcategory1": "refinedresources",
    "craftingrequirements": {
        "@craftingfocus": "62",
        "craftresource": [
            {"@uniquename": "T4_FIBER_LEVEL1", "@count": "2"},
            {"@uniquename": "T3_CLOTH", "@count": "1"},
        ],
    },
}

T4_HEAD_CLOTH_SET1_ITEM = {
    "@uniquename": "T4_HEAD_CLOTH_SET1",
    "@tier": "4",
    "@shopcategory": "crafting",
    "@shopsubcategory1": "cloth_helmet",
    "craftingrequirements": {
        "@craftingfocus": "429",
        "craftresource": {"@uniquename": "T4_CLOTH", "@count": "8"},
    },
    "enchantments": {
        "enchantment": {
            "@enchantmentlevel": "1",
            "craftingrequirements": {
                "@craftingfocus": "429",
                "craftresource": {"@uniquename": "T4_CLOTH_LEVEL1", "@count": "8"},
            },
        }
    },
}

T4_MOUNT_OX_ITEM = {
    "@uniquename": "T4_MOUNT_OX",
    "@tier": "4",
    "@shopcategory": "crafting",
    "@shopsubcategory1": "basemounts",
    "craftingrequirements": {
        "@craftingfocus": "200",
        "craftresource": [{"@uniquename": "T4_HIDE", "@count": "12"}],
    },
}

ITEMS_DATA = {
    "simpleitem": [
        T4_CLOTH_ITEM,
        T4_CLOTH_LEVEL1_ITEM,
        {"@uniquename": "T3_CLOTH", "@tier": "3", "@itemvalue": "8"},  # no craftingrequirements: skipped
    ],
    "equipmentitem": [T4_HEAD_CLOTH_SET1_ITEM],
    "weapon": [],
    "consumableitem": [],
    "mount": [T4_MOUNT_OX_ITEM],
}

LOCALIZED_NAMES = [
    {"UniqueName": "T4_CLOTH", "LocalizedNames": {"EN-US": "Fine Cloth"}},
    {"UniqueName": "T4_HEAD_CLOTH_SET1", "LocalizedNames": {"EN-US": "Adept's Scholar Cowl"}},
]

# --- Fixtures for the _LEVELk sibling filter regression tests ---

T5_ORE_ITEM_UNCRAFTABLE = {
    "@uniquename": "T5_ORE",
    "@tier": "5",
    "@itemvalue": "20",
    # no craftingrequirements: raw-gathered resource, not craftable
}

T5_ORE_LEVEL1_ITEM = {
    "@uniquename": "T5_ORE_LEVEL1",
    "@tier": "5",
    "@itemvalue": "40",
    "@shopcategory": "crafting",
    "@shopsubcategory1": "rawresources",
    "craftingrequirements": {
        "@craftingfocus": "10",
        "craftresource": [{"@uniquename": "T5_ORE", "@count": "2"}],
    },
}

ITEMS_DATA_UNCRAFTABLE_BASE = {
    "simpleitem": [T5_ORE_ITEM_UNCRAFTABLE, T5_ORE_LEVEL1_ITEM],
    "equipmentitem": [],
    "weapon": [],
    "consumableitem": [],
    "mount": [],
}

T4_LEVELING_TOME_ITEM = {
    "@uniquename": "T4_LEVELING_TOME",
    "@tier": "4",
    "@itemvalue": "5",
    "@shopcategory": "crafting",
    "@shopsubcategory1": "tomes",
    "craftingrequirements": {
        "@craftingfocus": "5",
        "craftresource": [{"@uniquename": "T4_CLOTH", "@count": "1"}],
    },
}


def test_generate_is_deterministic():
    from generate_recipes import generate

    rows1, summary1 = generate(ITEMS_DATA, LOCALIZED_NAMES)
    rows2, summary2 = generate(ITEMS_DATA, LOCALIZED_NAMES)
    assert rows1 == rows2
    assert summary1 == summary2


def test_generate_includes_base_and_enchant_rows():
    from generate_recipes import generate

    rows, summary = generate(ITEMS_DATA, LOCALIZED_NAMES)
    item_ids = {r["item_id"] for r in rows}
    assert "T4_CLOTH" in item_ids
    assert "T4_CLOTH_LEVEL1" in item_ids
    assert "T4_HEAD_CLOTH_SET1" in item_ids
    assert "T4_HEAD_CLOTH_SET1@1" in item_ids
    assert "T4_MOUNT_OX" in item_ids
    assert summary["per_category"]["simpleitem"] == 2
    assert summary["per_category"]["equipmentitem"] == 2
    assert summary["per_category"]["mount"] == 1
    assert any(item_id == "T3_CLOTH" for item_id, _reason in summary["skipped"])


def test_generate_extracts_mount_category():
    from generate_recipes import generate

    rows, _summary = generate(ITEMS_DATA, LOCALIZED_NAMES)
    mount_row = next(r for r in rows if r["item_id"] == "T4_MOUNT_OX")
    assert mount_row["category"] == "mount"
    assert mount_row["materials"] == [{"id": "T4_HIDE", "count": 12.0}]
    assert mount_row["focus_cost"] == 200.0


def test_generate_sorts_rows_deterministically():
    from generate_recipes import generate

    rows, _summary = generate(ITEMS_DATA, LOCALIZED_NAMES)
    keys = [(r["category"], r["tier"], r["item_id"], r["enchant"]) for r in rows]
    assert keys == sorted(keys)


def test_main_writes_recipes_and_core_files(tmp_path):
    from unittest.mock import patch
    from generate_recipes import main

    with patch("generate_recipes.load_items", return_value=ITEMS_DATA), \
         patch("generate_recipes.load_localized_names", return_value=LOCALIZED_NAMES):
        main(refresh=False, data_dir=tmp_path)

    recipes = json.loads((tmp_path / "recipes.json").read_text(encoding="utf-8"))
    core = json.loads((tmp_path / "recipes_core.json").read_text(encoding="utf-8"))
    assert len(recipes) == 5
    assert any(r["item_id"] == "T4_CLOTH" for r in core)


def test_generate_keeps_levelk_item_when_base_uncraftable():
    """A _LEVELk item whose base has no craftingrequirements must NOT be
    silently dropped -- it should fall through to normal top-level
    processing and appear as its own row, not be swallowed as a
    (nonexistent) enchant row of an uncraftable base."""
    from generate_recipes import generate

    rows, summary = generate(ITEMS_DATA_UNCRAFTABLE_BASE, [])
    item_ids = {r["item_id"] for r in rows}
    assert "T5_ORE_LEVEL1" in item_ids
    assert not any(item_id == "T5_ORE_LEVEL1" for item_id, _reason in summary["skipped"])
    # The uncraftable base itself is correctly skipped and logged.
    assert any(item_id == "T5_ORE" for item_id, _reason in summary["skipped"])
    # Only one row total: T5_ORE produced none (uncraftable), T5_ORE_LEVEL1
    # produced exactly one base row (never excluded from top-level
    # processing, since its base isn't craftable).
    assert len(rows) == 1


def test_generate_still_dedupes_attached_level_sibling():
    """Regression: a _LEVELk item whose base IS craftable must still be
    excluded from top-level processing and only appear via the base's
    enchant-row extraction (no duplicate item_id) -- confirms the new
    regex-based _is_attached_level_sibling logic preserves the original
    double-counting fix."""
    from generate_recipes import generate

    rows, summary = generate(ITEMS_DATA, LOCALIZED_NAMES)
    cloth_level1_rows = [r for r in rows if r["item_id"] == "T4_CLOTH_LEVEL1"]
    assert len(cloth_level1_rows) == 1
    assert cloth_level1_rows[0]["enchant"] == 1
    assert summary["per_category"]["simpleitem"] == 2


def test_generate_does_not_exclude_unrelated_level_substring():
    """An id that merely contains the substring "_LEVEL" without matching
    the exact _LEVEL[1-4] suffix (e.g. "_LEVELING_TOME") must not be
    excluded by the suffix-anchored regex."""
    from generate_recipes import generate

    items_data = {
        "simpleitem": [T4_CLOTH_ITEM, T4_LEVELING_TOME_ITEM],
        "equipmentitem": [],
        "weapon": [],
        "consumableitem": [],
        "mount": [],
    }
    rows, _summary = generate(items_data, LOCALIZED_NAMES)
    item_ids = {r["item_id"] for r in rows}
    assert "T4_LEVELING_TOME" in item_ids


def test_generate_extracts_transformationweapon_category():
    """Shapeshifter staves live under the separate top-level
    "transformationweapon" category in the real dump (not "weapon") --
    confirmed against the live 2026-08-18 data, all entries there are
    craftable with @shopsubcategory1="shapeshifterstaff"."""
    from generate_recipes import generate

    shapeshifter_item = {
        "@uniquename": "T4_2H_SHAPESHIFTER_SET1",
        "@tier": "4",
        "@shopcategory": "weapons",
        "@shopsubcategory1": "shapeshifterstaff",
        "craftingrequirements": {
            "@craftingfocus": "300",
            "craftresource": [{"@uniquename": "T4_METALBAR", "@count": "16"}],
        },
    }
    items_data = {
        "simpleitem": [],
        "equipmentitem": [],
        "weapon": [],
        "consumableitem": [],
        "mount": [],
        "transformationweapon": [shapeshifter_item],
    }
    rows, summary = generate(items_data, LOCALIZED_NAMES)
    assert summary["per_category"]["transformationweapon"] == 1
    row = next(r for r in rows if r["item_id"] == "T4_2H_SHAPESHIFTER_SET1")
    assert row["category"] == "transformationweapon"
    assert row["shop_subcategory"] == "shapeshifterstaff"


def test_generate_extracts_farmableitem_category():
    """farmableitem is a separate top-level category from the real dump
    (seeds craftable at a station -- distinct from the actual farming/
    growing mechanic, which this pipeline does not model). Confirmed
    against the live 2026-08-18 data: e.g. T1_FARM_CARROT_SEED, name
    "Carrot Seeds" (no tier honorific prefix, like most consumables),
    @shopsubcategory1="farm"."""
    from generate_recipes import generate

    seed_item = {
        "@uniquename": "T1_FARM_CARROT_SEED",
        "@tier": "1",
        "@shopcategory": "farming",
        "@shopsubcategory1": "farm",
        "craftingrequirements": {
            "@craftingfocus": "10",
            "craftresource": [{"@uniquename": "T1_CARROT", "@count": "1"}],
        },
    }
    items_data = {
        "simpleitem": [],
        "equipmentitem": [],
        "weapon": [],
        "consumableitem": [],
        "mount": [],
        "transformationweapon": [],
        "farmableitem": [seed_item],
    }
    localized_names = [{"UniqueName": "T1_FARM_CARROT_SEED", "LocalizedNames": {"EN-US": "Carrot Seeds"}}]

    rows, summary = generate(items_data, localized_names)
    assert summary["per_category"]["farmableitem"] == 1
    row = next(r for r in rows if r["item_id"] == "T1_FARM_CARROT_SEED")
    assert row["category"] == "farmableitem"
    assert row["shop_subcategory"] == "farm"
    assert row["name"] == "Carrot Seeds"


def test_generate_farmableitem_swaptransaction_silver_only_has_no_materials_but_nonzero_silver_cost():
    """Critical finding #1: most farmableitem rows (seeds) are bought
    directly for silver via craftingrequirements.@swaptransaction +
    @silver, not crafted from craftresource materials. Confirmed against
    the live 2026-08-18 data: T1_FARM_CARROT_SEED costs 2000 silver, no
    materials. The generated row must carry silver_cost so downstream
    profit math doesn't treat it as free."""
    from generate_recipes import generate

    seed_item = {
        "@uniquename": "T1_FARM_CARROT_SEED",
        "@tier": "1",
        "@itemvalue": "400",
        "@shopcategory": "farming",
        "@shopsubcategory1": "farm",
        "craftingrequirements": {
            "@silver": "2000",
            "@time": "0",
            "@swaptransaction": "true",
        },
    }
    items_data = {
        "simpleitem": [],
        "equipmentitem": [],
        "weapon": [],
        "consumableitem": [],
        "mount": [],
        "transformationweapon": [],
        "farmableitem": [seed_item],
    }
    localized_names = [{"UniqueName": "T1_FARM_CARROT_SEED", "LocalizedNames": {"EN-US": "Carrot Seeds"}}]

    rows, _summary = generate(items_data, localized_names)
    row = next(r for r in rows if r["item_id"] == "T1_FARM_CARROT_SEED")
    assert row["materials"] == []
    assert row["silver_cost"] == 2000.0


def test_build_en_lookup_skips_entries_with_null_localized_names():
    """Some real ao-bin-dumps entries have "LocalizedNames": null (not just
    a missing key) -- build_en_lookup must not crash on those and should
    just skip them (falling back to the raw unique_name elsewhere)."""
    from generate_recipes import build_en_lookup

    localized_names = [
        {"UniqueName": "T4_CLOTH", "LocalizedNames": {"EN-US": "Fine Cloth"}},
        {"UniqueName": "T4_BROKEN_ENTRY", "LocalizedNames": None},
    ]
    lookup = build_en_lookup(localized_names)
    assert lookup == {"T4_CLOTH": "Fine Cloth"}
