// Station fee and material cost — mirrors pipeline/calc_reference.py
// station_fee() and material_cost(). See docs/MECHANICS_SOURCE.md §2.4/§2.1.

import { isNonReturnable } from './returnRate';

export function stationFee(itemValue: number, feePer100Nutrition: number, tier: number): number {
  if (tier <= 2) return 0;
  const nutrition = itemValue * 0.1125;
  return nutrition * (feePer100Nutrition / 100);
}

export interface PricedMaterial {
  id: string;
  count: number;
  price: number;
}

export function materialCost(materials: PricedMaterial[], rrr: number): number {
  let total = 0;
  for (const mat of materials) {
    const rawCost = mat.price * mat.count;
    total += isNonReturnable(mat.id) ? rawCost : rawCost * (1 - rrr);
  }
  return total;
}
