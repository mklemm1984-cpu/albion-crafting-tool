import { describe, it, expect, beforeEach } from 'vitest';
import { savePrices, getPrice, getPriceAgeHours, clearPriceCache } from '../priceCache';
import type { PriceQuote } from '../aodpClient';

const SAMPLE: PriceQuote = {
  itemId: 'T4_CLOTH',
  city: 'Caerleon',
  sellPriceMin: 600,
  sellPriceMinDate: '2026-08-17T10:00:00',
  buyPriceMax: 550,
  buyPriceMaxDate: '2026-08-17T09:00:00',
};

beforeEach(() => {
  clearPriceCache();
});

describe('priceCache', () => {
  it('returns null for an uncached item', () => {
    expect(getPrice('T4_CLOTH', 'Caerleon')).toBeNull();
    expect(getPriceAgeHours('T4_CLOTH', 'Caerleon')).toBeNull();
  });

  it('saves and retrieves a price quote', () => {
    savePrices([SAMPLE], new Date('2026-08-17T12:00:00Z'));
    expect(getPrice('T4_CLOTH', 'Caerleon')).toEqual(SAMPLE);
  });

  it('computes price age in hours', () => {
    savePrices([SAMPLE], new Date('2026-08-17T10:00:00Z'));
    const age = getPriceAgeHours('T4_CLOTH', 'Caerleon', new Date('2026-08-17T13:30:00Z'));
    expect(age).toBeCloseTo(3.5, 5);
  });

  it('keeps separate entries per city', () => {
    savePrices([SAMPLE, { ...SAMPLE, city: 'Martlock', sellPriceMin: 700 }], new Date('2026-08-17T12:00:00Z'));
    expect(getPrice('T4_CLOTH', 'Caerleon')?.sellPriceMin).toBe(600);
    expect(getPrice('T4_CLOTH', 'Martlock')?.sellPriceMin).toBe(700);
  });
});
