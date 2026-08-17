"""Pure calculation functions for Albion Online crafting profit.

Formulas mirror docs/MECHANICS_SOURCE.md sections 2.1-2.6. Every function
here is deterministic and takes fully-resolved inputs (bonus values, prices)
so it can be unit tested without hitting any API.
"""

from __future__ import annotations

# Item ID substrings that are NOT returned by the Resource Return Rate.
NON_RETURNABLE_SUBSTRINGS = ("ARTEFACT", "_RUNE", "_SOUL", "_RELIC", "TOKEN")

FOCUS_BONUS = 0.59


def is_non_returnable(item_id: str) -> bool:
    """Artifacts, runes, souls, relics and faction tokens are charged at
    full price regardless of Resource Return Rate."""
    return any(s in item_id for s in NON_RETURNABLE_SUBSTRINGS)


def resource_return_rate(
    *,
    base_city_bonus: float,
    spec_bonus: float = 0.0,
    daily_bonus: float = 0.0,
    hideout_bonus: float = 0.0,
    use_focus: bool = False,
) -> float:
    """Resource Return Rate (RRR) from an additive production bonus stack.

    bonus = base_city_bonus + spec_bonus + daily_bonus + hideout_bonus
            + (0.59 if use_focus else 0)
    RRR   = bonus / (1 + bonus)
    """
    bonus = base_city_bonus + spec_bonus + daily_bonus + hideout_bonus
    if use_focus:
        bonus += FOCUS_BONUS
    return bonus / (1 + bonus)


def station_fee(item_value: float, fee_per_100_nutrition: float, tier: int) -> float:
    """Crafting station usage fee for one craft action. No fee for T1/T2."""
    if tier <= 2:
        return 0.0
    nutrition = item_value * 0.1125
    return nutrition * (fee_per_100_nutrition / 100)


def material_cost(materials: list[dict], rrr: float) -> float:
    """Total material cost for one craft action (whole batch), after RRR.

    materials: list of {"id": str, "count": float, "price": float}
    Artifacts/runes/souls/relics/tokens are excluded from the RRR refund.
    """
    total = 0.0
    for mat in materials:
        raw_cost = mat["price"] * mat["count"]
        if is_non_returnable(mat["id"]):
            total += raw_cost
        else:
            total += raw_cost * (1 - rrr)
    return total
