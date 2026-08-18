import { describe, it, expect } from 'vitest';
import { stationFee, materialCost } from '../costs';

describe('stationFee', () => {
  it('computes the T4 cloth station fee', () => {
    expect(stationFee(16, 150, 4)).toBeCloseTo(2.7, 2);
  });

  it('is zero for T1/T2', () => {
    expect(stationFee(999, 150, 1)).toBe(0);
    expect(stationFee(999, 150, 2)).toBe(0);
  });
});

describe('materialCost', () => {
  it('applies RRR to regular materials', () => {
    const cost = materialCost(
      [
        { id: 'T4_FIBER', count: 2, price: 200 },
        { id: 'T3_CLOTH', count: 1, price: 150 },
      ],
      0.435
    );
    expect(cost).toBeCloseTo(310.75, 2);
  });

  it('charges non-returnable materials at full price', () => {
    const cost = materialCost([{ id: 'T4_FACTION_TOKEN_MARTLOCK', count: 3, price: 100 }], 0.9);
    expect(cost).toBe(300);
  });
});
