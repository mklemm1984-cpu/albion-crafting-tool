from recipe_extract import normalize_to_list, select_standard_variant


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
