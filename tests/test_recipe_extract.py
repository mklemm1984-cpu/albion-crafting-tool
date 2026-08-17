from recipe_extract import normalize_to_list, select_standard_variant, compute_item_value, resolve_english_name, extract_base_row, extract_enchant_rows_for_resource, extract_enchant_rows_for_equipment


def test_normalize_to_list_wraps_dict():
    assert normalize_to_list({"a": 1}) == [{"a": 1}]


def test_normalize_to_list_passes_through_list():
    assert normalize_to_list([{"a": 1}, {"b": 2}]) == [{"a": 1}, {"b": 2}]


def test_normalize_to_list_none_becomes_empty_list():
    assert normalize_to_list(None) == []


def test_select_standard_variant_picks_non_faction():
    crafting_requirements = [
        {
            "@craftingfocus": "10",
            "craftresource": [{"@uniquename": "T4_FACTION_TOKEN_MARTLOCK", "@count": "1"}],
        },
        {
            "@craftingfocus": "20",
            "craftresource": [{"@uniquename": "T4_ORE", "@count": "3"}],
        },
    ]
    variant = select_standard_variant(crafting_requirements)
    assert variant["@craftingfocus"] == "20"


def test_select_standard_variant_single_dict_variant():
    crafting_requirements = {
        "@craftingfocus": "54",
        "craftresource": [{"@uniquename": "T4_FIBER", "@count": "2"}],
    }
    variant = select_standard_variant(crafting_requirements)
    assert variant["@craftingfocus"] == "54"


def test_select_standard_variant_returns_none_if_all_faction():
    crafting_requirements = [
        {"craftresource": {"@uniquename": "T4_FACTION_TOKEN_MARTLOCK", "@count": "1"}},
    ]
    assert select_standard_variant(crafting_requirements) is None


def test_compute_item_value_uses_direct_itemvalue():
    item = {"@uniquename": "T4_CLOTH", "@itemvalue": "16"}
    value, is_estimate = compute_item_value(item, variant={}, iv_lookup={})
    assert value == 16.0
    assert is_estimate is False


def test_compute_item_value_sums_ingredients_when_no_direct_value():
    item = {"@uniquename": "T4_HEAD_CLOTH_SET1"}
    variant = {"craftresource": {"@uniquename": "T4_CLOTH", "@count": "8"}}
    iv_lookup = {"T4_CLOTH": 16.0}
    value, is_estimate = compute_item_value(item, variant, iv_lookup)
    assert value == 128.0
    assert is_estimate is True


def test_resolve_english_name_base():
    assert resolve_english_name("T4_CLOTH", {"T4_CLOTH": "Fine Cloth"}, enchant=0) == "Fine Cloth"


def test_resolve_english_name_enchant_suffix():
    assert resolve_english_name("T4_CLOTH", {"T4_CLOTH": "Fine Cloth"}, enchant=2) == "Fine Cloth .2"


def test_resolve_english_name_missing_falls_back_to_id():
    assert resolve_english_name("T4_UNKNOWN", {}, enchant=0) == "T4_UNKNOWN"


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


def test_extract_base_row_t4_cloth():
    row = extract_base_row(T4_CLOTH_ITEM, "simpleitem", iv_lookup={}, en_lookup={"T4_CLOTH": "Fine Cloth"})
    assert row["item_id"] == "T4_CLOTH"
    assert row["name"] == "Fine Cloth"
    assert row["tier"] == 4
    assert row["enchant"] == 0
    assert row["category"] == "simpleitem"
    assert row["shop_category"] == "crafting"
    assert row["shop_subcategory"] == "refinedresources"
    assert row["output_amount"] == 1
    assert row["item_value"] == 16.0
    assert row["item_value_is_estimate"] is False
    assert row["focus_cost"] == 54.0
    assert row["materials"] == [
        {"id": "T4_FIBER", "count": 2.0},
        {"id": "T3_CLOTH", "count": 1.0},
    ]


def test_extract_base_row_returns_none_for_uncraftable_item():
    item = {"@uniquename": "T4_QUESTITEM", "@tier": "4"}
    assert extract_base_row(item, "simpleitem", {}, {}) is None


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


def test_extract_enchant_rows_for_resource():
    siblings = {1: T4_CLOTH_LEVEL1_ITEM}
    en_lookup = {"T4_CLOTH": "Fine Cloth"}
    rows = extract_enchant_rows_for_resource(T4_CLOTH_ITEM, siblings, "simpleitem", iv_lookup={}, en_lookup=en_lookup)
    assert len(rows) == 1
    assert rows[0]["item_id"] == "T4_CLOTH_LEVEL1"
    assert rows[0]["name"] == "Fine Cloth .1"
    assert rows[0]["enchant"] == 1
    assert rows[0]["item_value"] == 32.0  # doubled per enchant level, direct from the dump


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


def test_extract_enchant_rows_for_equipment():
    iv_lookup = {"T4_CLOTH_LEVEL1": 32.0}
    en_lookup = {"T4_HEAD_CLOTH_SET1": "Adept's Scholar Cowl"}
    rows = extract_enchant_rows_for_equipment(T4_HEAD_CLOTH_SET1_ITEM, "equipmentitem", iv_lookup, en_lookup)
    assert len(rows) == 1
    row = rows[0]
    assert row["item_id"] == "T4_HEAD_CLOTH_SET1@1"
    assert row["name"] == "Adept's Scholar Cowl .1"
    assert row["enchant"] == 1
    assert row["shop_subcategory"] == "cloth_helmet"
    assert row["materials"] == [{"id": "T4_CLOTH_LEVEL1", "count": 8.0}]
    assert row["item_value"] == 256.0
    assert row["item_value_is_estimate"] is True
