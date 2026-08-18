// Resource Return Rate (RRR) — mirrors pipeline/calc_reference.py
// resource_return_rate(). See docs/MECHANICS_SOURCE.md §2.1.

export interface ReturnRateInput {
  baseCityBonus: number;
  specBonus?: number;
  dailyBonus?: number;
  hideoutBonus?: number;
  useFocus?: boolean;
}

const FOCUS_BONUS = 0.59;

export function resourceReturnRate(input: ReturnRateInput): number {
  const {
    baseCityBonus,
    specBonus = 0,
    dailyBonus = 0,
    hideoutBonus = 0,
    useFocus = false,
  } = input;
  let bonus = baseCityBonus + specBonus + dailyBonus + hideoutBonus;
  if (useFocus) bonus += FOCUS_BONUS;
  return bonus / (1 + bonus);
}

const NON_RETURNABLE_SUBSTRINGS = ['ARTEFACT', '_RUNE', '_SOUL', '_RELIC', 'TOKEN'];

export function isNonReturnable(itemId: string): boolean {
  return NON_RETURNABLE_SUBSTRINGS.some((s) => itemId.includes(s));
}
