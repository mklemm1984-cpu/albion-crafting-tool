// Client for the Albion Online Data Project price API. CORS is open
// (access-control-allow-origin: *, verified 2026-08-17), so this runs
// directly in the browser with no backend/proxy.

export interface PriceQuote {
  itemId: string;
  city: string;
  sellPriceMin: number;
  sellPriceMinDate: string;
  buyPriceMax: number;
  buyPriceMaxDate: string;
}

const BASE_URL = 'https://europe.albion-online-data.com/api/v2/stats/prices';
const BATCH_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

interface RawPriceEntry {
  item_id: string;
  city: string;
  sell_price_min: number;
  sell_price_min_date: string;
  buy_price_max: number;
  buy_price_max_date: string;
}

async function fetchBatch(itemIds: string[], cities: string[], quality: number): Promise<PriceQuote[]> {
  const idsParam = itemIds.map((id) => encodeURIComponent(id)).join(',');
  const citiesParam = cities.map((c) => encodeURIComponent(c)).join(',');
  const url = `${BASE_URL}/${idsParam}.json?locations=${citiesParam}&qualities=${quality}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Price fetch failed: HTTP ${response.status}`);
  }
  const raw: RawPriceEntry[] = await response.json();
  return raw.map((r) => ({
    itemId: r.item_id,
    city: r.city,
    sellPriceMin: r.sell_price_min,
    sellPriceMinDate: r.sell_price_min_date,
    buyPriceMax: r.buy_price_max,
    buyPriceMaxDate: r.buy_price_max_date,
  }));
}

export interface FetchPricesOptions {
  itemIds: string[];
  cities: string[];
  quality?: number;
  batchDelayMs?: number;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Fetches prices for many items across the given cities, batching requests
 * at BATCH_SIZE ids per call with a small delay between batches to be
 * gentle on the shared community API.
 */
export async function fetchPrices({
  itemIds,
  cities,
  quality = 1,
  batchDelayMs = 200,
  onProgress,
}: FetchPricesOptions): Promise<PriceQuote[]> {
  const batches = chunk(itemIds, BATCH_SIZE);
  const results: PriceQuote[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batchResults = await fetchBatch(batches[i], cities, quality);
    results.push(...batchResults);
    onProgress?.(i + 1, batches.length);
    if (i < batches.length - 1 && batchDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, batchDelayMs));
    }
  }

  return results;
}
