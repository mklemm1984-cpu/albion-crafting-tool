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


from calc_reference import craft_profit

# Rounded to 4 dp to match how docs/MECHANICS_SOURCE.md §8 computed its
# shared worked-example config ("RRR = 0.77/1.77 = 0.4350 (4 dp)"). The raw
# unrounded division (0.43502824...) is off by more than the abs=1e-2
# tolerance below once multiplied through a materials sum of a few hundred
# silver — resource_return_rate() itself still returns full precision for
# production use; this rounding is specific to reproducing the master
# prompt's manually-computed acceptance numbers.
SHARED_RRR = round(resource_return_rate(base_city_bonus=0.18, use_focus=True), 4)


def test_craft_profit_refining_t4_cloth():
    result = craft_profit(
        materials=[
            {"id": "T4_FIBER", "count": 2, "price": 200},
            {"id": "T3_CLOTH", "count": 1, "price": 150},
        ],
        output_amount=1,
        item_value=16,
        focus_cost=54,
        tier=4,
        sell_price=600,
        rrr=SHARED_RRR,
        fee_per_100_nutrition=150,
        sales_tax=0.04,
        setup_fee=0.025,
    )
    assert result["no_price_data"] is False
    assert result["material_cost"] == pytest.approx(310.75, abs=1e-2)
    assert result["fee"] == pytest.approx(2.70, abs=1e-2)
    assert result["cost_per_unit"] == pytest.approx(313.45, abs=1e-2)
    assert result["net_revenue"] == pytest.approx(561.00, abs=1e-2)
    assert result["profit_per_unit"] == pytest.approx(247.55, abs=1e-2)
    assert result["margin_pct"] == pytest.approx(0.790, abs=1e-3)
    assert result["silver_per_focus"] == pytest.approx(4.584, abs=1e-3)


def test_craft_profit_gear_t4_head_cloth_set1():
    result = craft_profit(
        materials=[{"id": "T4_CLOTH", "count": 8, "price": 600}],
        output_amount=1,
        item_value=128,
        focus_cost=429,
        tier=4,
        sell_price=4000,
        rrr=SHARED_RRR,
        fee_per_100_nutrition=150,
        sales_tax=0.04,
        setup_fee=0.025,
    )
    assert result["cost_per_unit"] == pytest.approx(2733.60, abs=1e-2)
    assert result["net_revenue"] == pytest.approx(3740.00, abs=1e-2)
    assert result["profit_per_unit"] == pytest.approx(1006.40, abs=1e-2)
    assert result["margin_pct"] == pytest.approx(0.368, abs=1e-3)
    assert result["silver_per_focus"] == pytest.approx(2.346, abs=1e-3)


def test_craft_profit_no_price_data_missing_output_price():
    result = craft_profit(
        materials=[{"id": "T4_CLOTH", "count": 8, "price": 600}],
        output_amount=1,
        item_value=128,
        focus_cost=429,
        tier=4,
        sell_price=0,
        rrr=SHARED_RRR,
        fee_per_100_nutrition=150,
        sales_tax=0.04,
        setup_fee=0.025,
    )
    assert result["no_price_data"] is True
    assert result["profit_per_unit"] is None


def test_craft_profit_no_price_data_missing_material_price():
    result = craft_profit(
        materials=[{"id": "T4_CLOTH", "count": 8, "price": None}],
        output_amount=1,
        item_value=128,
        focus_cost=429,
        tier=4,
        sell_price=4000,
        rrr=SHARED_RRR,
        fee_per_100_nutrition=150,
        sales_tax=0.04,
        setup_fee=0.025,
    )
    assert result["no_price_data"] is True


def test_craft_profit_t1_t2_zero_fee():
    result = craft_profit(
        materials=[{"id": "T2_ORE", "count": 2, "price": 10}],
        output_amount=1,
        item_value=4,
        focus_cost=5,
        tier=2,
        sell_price=20,
        rrr=SHARED_RRR,
        fee_per_100_nutrition=150,
        sales_tax=0.04,
        setup_fee=0.025,
    )
    assert result["fee"] == 0


def test_craft_profit_batch_potion():
    result = craft_profit(
        materials=[{"id": "T4_TESTHERB", "count": 10, "price": 20}],
        output_amount=5,
        item_value=50,
        focus_cost=100,
        tier=4,
        sell_price=100,
        rrr=SHARED_RRR,
        fee_per_100_nutrition=150,
        sales_tax=0.04,
        setup_fee=0.025,
    )
    assert result["cost_per_unit"] == pytest.approx(24.2875, abs=1e-3)
    assert result["profit_per_batch"] == pytest.approx(346.06, abs=1e-1)
    assert result["silver_per_focus"] == pytest.approx(3.4606, abs=1e-3)
