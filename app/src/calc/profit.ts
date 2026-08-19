// Net revenue, profit, silver-per-focus and the full craftProfit()
// integration — mirrors pipeline/calc_reference.py. See
// docs/MECHANICS_SOURCE.md §2.3/§2.6 and §8 for the acceptance numbers.

import { materialCost, stationFee, PricedMaterial } from './costs';

export function netRevenuePerUnit(sellPrice: number, salesTax: number, setupFee: number): number {
  return sellPrice * (1 - salesTax - setupFee);
}

export function profit(costPerUnit: number, netRevenue: number): number {
  return netRevenue - costPerUnit;
}

export function silverPerFocus(profitPerBatch: number, baseFocusCost: number): number | null {
  if (!baseFocusCost) return null;
  return profitPerBatch / baseFocusCost;
}

export interface MaterialInput {
  id: string;
  count: number;
  price: number | null;
}

export interface CraftProfitInput {
  materials: MaterialInput[];
  outputAmount: number;
  itemValue: number;
  focusCost: number;
  tier: number;
  sellPrice: number | null;
  rrr: number;
  feePer100Nutrition: number;
  salesTax: number;
  setupFee: number;
  /** Flat, non-returnable silver cost (e.g. seeds/vanity items bought
   * directly via @swaptransaction+@silver rather than crafted from
   * materials). NOT subject to the resource-return-rate discount --
   * see docs/MECHANICS_SOURCE.md and pipeline/recipe_extract.py. */
  silverCost?: number;
}

export interface CraftProfitResult {
  materialCost: number | null;
  fee: number | null;
  costPerUnit: number | null;
  netRevenue: number | null;
  profitPerUnit: number | null;
  marginPct: number | null;
  profitPerBatch: number | null;
  silverPerFocus: number | null;
  noPriceData: boolean;
}

export function craftProfit(input: CraftProfitInput): CraftProfitResult {
  const missingMaterialPrice = input.materials.some((m) => m.price === null || m.price === 0);
  if (missingMaterialPrice || input.sellPrice === null || input.sellPrice === 0) {
    return {
      materialCost: null,
      fee: null,
      costPerUnit: null,
      netRevenue: null,
      profitPerUnit: null,
      marginPct: null,
      profitPerBatch: null,
      silverPerFocus: null,
      noPriceData: true,
    };
  }

  const pricedMaterials: PricedMaterial[] = input.materials.map((m) => ({
    id: m.id,
    count: m.count,
    price: m.price as number,
  }));

  const matCost = materialCost(pricedMaterials, input.rrr);
  const fee = stationFee(input.itemValue, input.feePer100Nutrition, input.tier);
  const silverCost = input.silverCost ?? 0;
  const totalCost = matCost + fee + silverCost;
  const costPerUnit = totalCost / input.outputAmount;
  const netRevenue = netRevenuePerUnit(input.sellPrice, input.salesTax, input.setupFee);
  const profitPerUnit = profit(costPerUnit, netRevenue);
  const profitPerBatch = profitPerUnit * input.outputAmount;
  const marginPct = costPerUnit ? profitPerUnit / costPerUnit : null;
  const spf = silverPerFocus(profitPerBatch, input.focusCost);

  return {
    materialCost: matCost,
    fee,
    costPerUnit,
    netRevenue,
    profitPerUnit,
    marginPct,
    profitPerBatch,
    silverPerFocus: spf,
    noPriceData: false,
  };
}
