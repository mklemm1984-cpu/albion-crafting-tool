import React, { useState } from 'react';
import { fetchPrices } from '../data/aodpClient';
import { savePrices } from '../data/priceCache';
import type { Recipe } from '../data/types';
import type { CalcConfig } from '../state/ConfigContext';

interface PriceRefreshBarProps {
  visibleRecipes: Recipe[];
  allRecipes: Recipe[];
  config: CalcConfig;
  onDone: () => void;
}

function collectItemIds(recipes: Recipe[]): string[] {
  const ids = new Set<string>();
  for (const recipe of recipes) {
    ids.add(recipe.itemId);
    for (const material of recipe.materials) {
      ids.add(material.id);
    }
  }
  return Array.from(ids);
}

export function PriceRefreshBar({ visibleRecipes, allRecipes, config, onDone }: PriceRefreshBarProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh(recipes: Recipe[]) {
    setError(null);
    setIsRefreshing(true);
    const itemIds = collectItemIds(recipes);
    const cities = Array.from(new Set([config.buyCity, config.sellCity]));
    try {
      const quotes = await fetchPrices({
        itemIds,
        cities,
        quality: config.quality,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      savePrices(quotes);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler beim Preis-Refresh');
    } finally {
      setProgress(null);
      setIsRefreshing(false);
    }
  }

  return (
    <div className="price-refresh-bar">
      <button onClick={() => refresh(visibleRecipes)} disabled={isRefreshing}>
        Preise aktualisieren (gefilterte Ansicht)
      </button>
      <button onClick={() => refresh(allRecipes)} disabled={isRefreshing}>
        Alle laden
      </button>
      {progress && (
        <span role="status">Lade Batch {progress.done} / {progress.total}…</span>
      )}
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
