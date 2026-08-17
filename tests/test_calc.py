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


from calc_reference import material_cost


def test_material_cost_applies_rrr():
    materials = [
        {"id": "T4_FIBER", "count": 2, "price": 200},
        {"id": "T3_CLOTH", "count": 1, "price": 150},
    ]
    cost = material_cost(materials, rrr=0.4350)
    assert cost == pytest.approx(310.75, abs=1e-2)


def test_material_cost_full_price_for_non_returnable():
    materials = [{"id": "T4_FACTION_TOKEN_MARTLOCK", "count": 3, "price": 100}]
    cost = material_cost(materials, rrr=0.9)
    assert cost == 300


from calc_reference import net_revenue_per_unit, profit, silver_per_focus


def test_net_revenue_per_unit():
    assert net_revenue_per_unit(600, sales_tax=0.04, setup_fee=0.025) == pytest.approx(561.0, abs=1e-2)


def test_profit():
    assert profit(cost_per_unit=313.45, net_revenue=561.0) == pytest.approx(247.55, abs=1e-2)


def test_silver_per_focus():
    assert silver_per_focus(247.55, 54) == pytest.approx(4.584, abs=1e-3)


def test_silver_per_focus_zero_focus_cost_returns_none():
    assert silver_per_focus(100.0, 0) is None
