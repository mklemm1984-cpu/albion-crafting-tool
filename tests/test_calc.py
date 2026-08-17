import pytest

from calc_reference import resource_return_rate, is_non_returnable


def test_resource_return_rate_base_city():
    assert resource_return_rate(base_city_bonus=0.18) == pytest.approx(0.1525, abs=1e-4)


def test_resource_return_rate_with_focus():
    rrr = resource_return_rate(base_city_bonus=0.18, use_focus=True)
    assert round(rrr, 4) == 0.4350


def test_resource_return_rate_with_hideout_bonus():
    rrr = resource_return_rate(
        base_city_bonus=0.18, spec_bonus=0.15, hideout_bonus=0.10, use_focus=True
    )
    assert round(rrr, 4) == 0.5050


def test_is_non_returnable():
    assert is_non_returnable("T5_ARTEFACT_FOCUS_AVALON")
    assert is_non_returnable("T4_RUNE")
    assert is_non_returnable("T4_SOUL")
    assert is_non_returnable("T4_RELIC")
    assert is_non_returnable("T4_FACTION_TOKEN_MARTLOCK")
    assert not is_non_returnable("T4_CLOTH")
