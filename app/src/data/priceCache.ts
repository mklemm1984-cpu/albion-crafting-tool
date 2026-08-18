// Caches AODP price quotes in localStorage with a timestamp, so the
// Dashboard can show price age and avoid refetching on every reload.

import type { PriceQuote } from './aodpClient';

const STORAGE_KEY = 'albion-crafting-tool:price-cache:v1';

interface CacheEntry {
  quote: PriceQuote;
  fetchedAt: string; // ISO timestamp
}

type CacheShape = Record<string, CacheEntry>; // key: `${itemId}|${city}`

function cacheKey(itemId: string, city: string): string {
  return `${itemId}|${city}`;
}

function readCache(): CacheShape {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as CacheShape;
  } catch {
    return {};
  }
}

function writeCache(cache: CacheShape): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
}

export function savePrices(quotes: PriceQuote[], now: Date = new Date()): void {
  const cache = readCache();
  for (const quote of quotes) {
    cache[cacheKey(quote.itemId, quote.city)] = { quote, fetchedAt: now.toISOString() };
  }
  writeCache(cache);
}

export function getPrice(itemId: string, city: string): PriceQuote | null {
  const cache = readCache();
  return cache[cacheKey(itemId, city)]?.quote ?? null;
}

/** Age of a cached price in hours, or null if not cached. */
export function getPriceAgeHours(itemId: string, city: string, now: Date = new Date()): number | null {
  const cache = readCache();
  const entry = cache[cacheKey(itemId, city)];
  if (!entry) return null;
  const fetchedAt = new Date(entry.fetchedAt).getTime();
  return (now.getTime() - fetchedAt) / (1000 * 60 * 60);
}

export function clearPriceCache(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** A pre-parsed, read-only view over the price cache, for callers (like
 * Dashboard) that need to look up many prices in one pass without paying
 * for a fresh localStorage read + JSON.parse on every single lookup. */
export interface PriceCacheSnapshot {
  get(itemId: string, city: string): PriceQuote | null;
  getAgeHours(itemId: string, city: string, now?: Date): number | null;
}

export function readPriceCacheSnapshot(): PriceCacheSnapshot {
  const cache = readCache();
  return {
    get(itemId: string, city: string): PriceQuote | null {
      return cache[cacheKey(itemId, city)]?.quote ?? null;
    },
    getAgeHours(itemId: string, city: string, now: Date = new Date()): number | null {
      const entry = cache[cacheKey(itemId, city)];
      if (!entry) return null;
      const fetchedAt = new Date(entry.fetchedAt).getTime();
      return (now.getTime() - fetchedAt) / (1000 * 60 * 60);
    },
  };
}
