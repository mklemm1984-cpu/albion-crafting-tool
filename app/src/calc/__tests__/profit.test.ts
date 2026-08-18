import { describe, it, expect } from 'vitest';
import { craftProfit, netRevenuePerUnit, profit, silverPerFocus } from '../profit';
import { resourceReturnRate } from '../returnRate';

describe('netRevenuePerUnit / profit / silverPerFocus', () => {
  it('computes net revenue', () => {
    expect(netRevenuePerUnit(600, 0.04, 0.025)).toBeCloseTo(561.0, 2);
  });

  it('computes profit', () => {
    expect(profit(313.45, 561.0)).toBeCloseTo(247.55, 2);
  });

  it('computes silver per focus', () => {
    expect(silverPerFocus(247.55, 54)).toBeCloseTo(4.584, 3);
  });

  it('returns null for zero focus cost', () => {
    expect(silverPerFocus(100, 0)).toBeNull();
  });
});

// Rounded to 4 dp to match docs/MECHANICS_SOURCE.md §8's shared worked-example
// config ("RRR = 0.77/1.77 = 0.4350 (4 dp)"). The raw unrounded division
// (0.43502824...) is off by more than the 2-3 decimal toBeCloseTo tolerance
// below once multiplied through a materials sum of a few hundred silver.
const SHARED_RRR = Math.round(resourceReturnRate({ baseCityBonus: 0.18, useFocus: true }) * 10000) / 10000;

describe('craftProfit', () => {
  it('matches the refining acceptance example (T4_CLOTH)', () => {
    const result = craftProfit({
      materials: [
        { id: 'T4_FIBER', count: 2, price: 200 },
        { id: 'T3_CLOTH', count: 1, price: 150 },
      ],
      outputAmount: 1,
      itemValue: 16,
      focusCost: 54,
      tier: 4,
      sellPrice: 600,
      rrr: SHARED_RRR,
      feePer100Nutrition: 150,
      salesTax: 0.04,
      setupFee: 0.025,
    });
    expect(result.noPriceData).toBe(false);
    expect(result.materialCost).toBeCloseTo(310.75, 2);
    expect(result.fee).toBeCloseTo(2.7, 2);
    expect(result.costPerUnit).toBeCloseTo(313.45, 2);
    expect(result.netRevenue).toBeCloseTo(561.0, 2);
    expect(result.profitPerUnit).toBeCloseTo(247.55, 2);
    expect(result.marginPct).toBeCloseTo(0.79, 3);
    expect(result.silverPerFocus).toBeCloseTo(4.584, 3);
  });

  it('matches the gear acceptance example (T4_HEAD_CLOTH_SET1)', () => {
    const result = craftProfit({
      materials: [{ id: 'T4_CLOTH', count: 8, price: 600 }],
      outputAmount: 1,
      itemValue: 128,
      focusCost: 429,
      tier: 4,
      sellPrice: 4000,
      rrr: SHARED_RRR,
      feePer100Nutrition: 150,
      salesTax: 0.04,
      setupFee: 0.025,
    });
    expect(result.costPerUnit).toBeCloseTo(2733.6, 2);
    expect(result.netRevenue).toBeCloseTo(3740.0, 2);
    expect(result.profitPerUnit).toBeCloseTo(1006.4, 2);
    expect(result.marginPct).toBeCloseTo(0.368, 3);
    expect(result.silverPerFocus).toBeCloseTo(2.346, 3);
  });

  it('flags NO_PRICE_DATA when the sell price is missing', () => {
    const result = craftProfit({
      materials: [{ id: 'T4_CLOTH', count: 8, price: 600 }],
      outputAmount: 1,
      itemValue: 128,
      focusCost: 429,
      tier: 4,
      sellPrice: null,
      rrr: SHARED_RRR,
      feePer100Nutrition: 150,
      salesTax: 0.04,
      setupFee: 0.025,
    });
    expect(result.noPriceData).toBe(true);
    expect(result.profitPerUnit).toBeNull();
  });

  it('flags NO_PRICE_DATA when a material price is missing', () => {
    const result = craftProfit({
      materials: [{ id: 'T4_CLOTH', count: 8, price: null }],
      outputAmount: 1,
      itemValue: 128,
      focusCost: 429,
      tier: 4,
      sellPrice: 4000,
      rrr: SHARED_RRR,
      feePer100Nutrition: 150,
      salesTax: 0.04,
      setupFee: 0.025,
    });
    expect(result.noPriceData).toBe(true);
  });

  it('charges zero station fee for T1/T2', () => {
    const result = craftProfit({
      materials: [{ id: 'T2_ORE', count: 2, price: 10 }],
      outputAmount: 1,
      itemValue: 4,
      focusCost: 5,
      tier: 2,
      sellPrice: 20,
      rrr: SHARED_RRR,
      feePer100Nutrition: 150,
      salesTax: 0.04,
      setupFee: 0.025,
    });
    expect(result.fee).toBe(0);
  });

  it('divides batch cost by output amount for a 5x potion craft', () => {
    const result = craftProfit({
      materials: [{ id: 'T4_TESTHERB', count: 10, price: 20 }],
      outputAmount: 5,
      itemValue: 50,
      focusCost: 100,
      tier: 4,
      sellPrice: 100,
      rrr: SHARED_RRR,
      feePer100Nutrition: 150,
      salesTax: 0.04,
      setupFee: 0.025,
    });
    expect(result.costPerUnit).toBeCloseTo(24.2875, 3);
    expect(result.profitPerBatch).toBeCloseTo(346.06, 1);
    expect(result.silverPerFocus).toBeCloseTo(3.4606, 3);
  });
});
