import { describe, it, expect, beforeEach } from 'vitest';
import { savePrices, getPrice, getPriceAgeHours, clearPriceCache, readPriceCacheSnapshot } from '../priceCache';
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

describe('readPriceCacheSnapshot', () => {
  it('returns correct data for multiple items/cities from a single parsed snapshot', () => {
    const otherItem: PriceQuote = {
      itemId: 'T4_FIBER',
      city: 'Martlock',
      sellPriceMin: 120,
      sellPriceMinDate: '2026-08-17T10:00:00',
      buyPriceMax: 100,
      buyPriceMaxDate: '2026-08-17T09:00:00',
    };
    savePrices([SAMPLE, { ...SAMPLE, city: 'Martlock', sellPriceMin: 700 }, otherItem], new Date('2026-08-17T12:00:00Z'));

    const snapshot = readPriceCacheSnapshot();

    expect(snapshot.get('T4_CLOTH', 'Caerleon')).toEqual(SAMPLE);
    expect(snapshot.get('T4_CLOTH', 'Martlock')?.sellPriceMin).toBe(700);
    expect(snapshot.get('T4_FIBER', 'Martlock')).toEqual(otherItem);
    expect(snapshot.get('T4_FIBER', 'Caerleon')).toBeNull();
  });

  it('computes age hours from the pre-parsed snapshot the same way getPriceAgeHours does', () => {
    savePrices([SAMPLE], new Date('2026-08-17T10:00:00Z'));
    const snapshot = readPriceCacheSnapshot();
    const age = snapshot.getAgeHours('T4_CLOTH', 'Caerleon', new Date('2026-08-17T13:30:00Z'));
    expect(age).toBeCloseTo(3.5, 5);
    expect(snapshot.getAgeHours('T4_CLOTH', 'Martlock')).toBeNull();
  });

  it('is a point-in-time snapshot: later savePrices calls do not retroactively change it', () => {
    savePrices([SAMPLE], new Date('2026-08-17T12:00:00Z'));
    const snapshot = readPriceCacheSnapshot();
    savePrices([{ ...SAMPLE, sellPriceMin: 999 }], new Date('2026-08-17T12:30:00Z'));

    expect(snapshot.get('T4_CLOTH', 'Caerleon')?.sellPriceMin).toBe(600);
    expect(getPrice('T4_CLOTH', 'Caerleon')?.sellPriceMin).toBe(999);
  });
});
