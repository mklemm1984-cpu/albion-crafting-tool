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
