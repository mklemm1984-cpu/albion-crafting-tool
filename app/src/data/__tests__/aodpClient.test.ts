import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchPrices } from '../aodpClient';

afterEach(() => {
  vi.unstubAllGlobals();
});

function rawEntry(itemId: string, city: string) {
  return {
    item_id: itemId,
    city,
    sell_price_min: 600,
    sell_price_min_date: '2026-08-17T10:00:00',
    buy_price_max: 550,
    buy_price_max_date: '2026-08-17T09:00:00',
  };
}

describe('fetchPrices', () => {
  it('maps a single small batch to typed PriceQuote objects', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([rawEntry('T4_CLOTH', 'Caerleon')]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const prices = await fetchPrices({ itemIds: ['T4_CLOTH'], cities: ['Caerleon'], batchDelayMs: 0 });

    expect(prices).toEqual([
      {
        itemId: 'T4_CLOTH',
        city: 'Caerleon',
        sellPriceMin: 600,
        sellPriceMinDate: '2026-08-17T10:00:00',
        buyPriceMax: 550,
        buyPriceMaxDate: '2026-08-17T09:00:00',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('T4_CLOTH');
    expect(calledUrl).toContain('locations=Caerleon');
  });

  it('splits more than 100 ids into multiple batches and reports progress', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    vi.stubGlobal('fetch', fetchMock);
    const itemIds = Array.from({ length: 150 }, (_, i) => `T4_ITEM_${i}`);
    const progressCalls: [number, number][] = [];

    await fetchPrices({
      itemIds,
      cities: ['Caerleon'],
      batchDelayMs: 0,
      onProgress: (done, total) => progressCalls.push([done, total]),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(progressCalls).toEqual([[1, 2], [2, 2]]);
  });

  it('URL-encodes @ in item ids and spaces in city names', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    vi.stubGlobal('fetch', fetchMock);

    await fetchPrices({ itemIds: ['T4_HEAD_CLOTH_SET1@1'], cities: ['Fort Sterling'], batchDelayMs: 0 });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('T4_HEAD_CLOTH_SET1%401');
    expect(calledUrl).toContain('Fort%20Sterling');
  });
});
