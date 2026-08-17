import pytest

from calc_reference import resource_return_rate, is_non_returnable, station_fee


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


def test_station_fee_t4_cloth():
    assert station_fee(item_value=16, fee_per_100_nutrition=150, tier=4) == pytest.approx(2.70, abs=1e-2)


def test_station_fee_zero_for_t1_t2():
    assert station_fee(item_value=999, fee_per_100_nutrition=150, tier=1) == 0
    assert station_fee(item_value=999, fee_per_100_nutrition=150, tier=2) == 0
