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
