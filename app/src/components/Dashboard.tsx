import React, { useMemo } from 'react';
import type { Recipe } from '../data/types';
import type { CalcConfig } from '../state/ConfigContext';
import { BASE_CITY_BONUS } from '../state/ConfigContext';
import { craftingSpecCity, refiningSpecCity } from '../data/citySpecializations';
import { readPriceCacheSnapshot, PriceCacheSnapshot } from '../data/priceCache';
import { resourceReturnRate } from '../calc/returnRate';
import { craftProfit, CraftProfitResult } from '../calc/profit';
import { matchesStructuralFilters, type Filters } from './FilterSortControls';

// German-locale number formatting. Silver amounts get no decimals -- Albion
// silver has no fractional unit, 1 silver is the smallest denomination in
// the game -- just thousands grouped with '.' (e.g. "1.234.567" instead of
// raw JS toFixed() output like "1234567.89"). Silver-per-focus is a ratio,
// not a silver amount, so it keeps decimal precision.
const INT_FORMAT = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const RATIO_FORMAT = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

function formatSilver(value: number): string {
  return INT_FORMAT.format(Math.round(value));
}

function formatInt(value: number): string {
  return INT_FORMAT.format(value);
}

function formatRatio(value: number): string {
  return RATIO_FORMAT.format(value);
}

interface DashboardRow {
  recipe: Recipe;
  result: CraftProfitResult;
  priceAgeHours: number | null;
  sellPrice: number | null;
}

function buildRow(recipe: Recipe, config: CalcConfig, snapshot: PriceCacheSnapshot): DashboardRow {
  const specCity = recipe.category === 'simpleitem' ? refiningSpecCity(recipe) : craftingSpecCity(recipe);
  const specBonus = specCity && specCity === config.buyCity ? (recipe.category === 'simpleitem' ? 0.4 : 0.15) : 0;

  const rrr = resourceReturnRate({
    baseCityBonus: BASE_CITY_BONUS,
    specBonus,
    dailyBonus: config.dailyBonus,
    hideoutBonus: config.hideoutBonusPct,
    useFocus: config.useFocus,
  });

  const materialsWithPrices = recipe.materials.map((m) => {
    const quote = snapshot.get(m.id, config.buyCity);
    const price = config.buyMode === 'instant' ? quote?.sellPriceMin : quote?.buyPriceMax;
    return { id: m.id, count: m.count, price: price ?? null };
  });

  const sellQuote = snapshot.get(recipe.itemId, config.sellCity);
  const sellPrice = config.sellMode === 'order' ? sellQuote?.sellPriceMin : sellQuote?.buyPriceMax;

  const salesTax = config.premium ? 0.04 : 0.08;
  const setupFee = config.sellMode === 'order' ? 0.025 : 0;

  const result = craftProfit({
    materials: materialsWithPrices,
    outputAmount: recipe.outputAmount,
    itemValue: recipe.itemValue,
    focusCost: recipe.focusCost,
    tier: recipe.tier,
    sellPrice: sellPrice ?? null,
    rrr,
    feePer100Nutrition: config.feePer100Nutrition,
    salesTax,
    setupFee,
  });

  const priceAgeHours = snapshot.getAgeHours(recipe.itemId, config.sellCity);

  return { recipe, result, priceAgeHours, sellPrice: sellPrice ?? null };
}

function applyFilters(rows: DashboardRow[], filters: Filters): DashboardRow[] {
  return rows.filter((row) => {
    if (!matchesStructuralFilters(row.recipe, filters)) return false;
    if (filters.onlyProfitable) {
      if (row.result.noPriceData) return false;
      if ((row.result.profitPerUnit ?? 0) <= 0) return false;
    }
    return true;
  });
}

function sortRows(rows: DashboardRow[], sortKey: Filters['sortKey']): DashboardRow[] {
  return [...rows].sort((a, b) => {
    if (a.result.noPriceData && b.result.noPriceData) return 0;
    if (a.result.noPriceData) return 1;
    if (b.result.noPriceData) return -1;
    const aVal = sortKey === 'profitPerUnit' ? a.result.profitPerUnit! : a.result.silverPerFocus ?? -Infinity;
    const bVal = sortKey === 'profitPerUnit' ? b.result.profitPerUnit! : b.result.silverPerFocus ?? -Infinity;
    return bVal - aVal;
  });
}

export function Dashboard({ recipes, config, filters }: { recipes: Recipe[]; config: CalcConfig; filters: Filters }) {
  const rows = useMemo(() => {
    const snapshot = readPriceCacheSnapshot();
    const built = recipes.map((r) => buildRow(r, config, snapshot));
    const filtered = applyFilters(built, filters);
    return sortRows(filtered, filters.sortKey);
  }, [recipes, config, filters]);

  return (
    <table className="dashboard-table">
      <thead>
        <tr>
          <th>Item</th>
          <th>Tier</th>
          <th>Enchant</th>
          <th>Materialkosten</th>
          <th>Stationsgebühr</th>
          <th>Kosten/Einheit</th>
          <th>Verkaufspreis</th>
          <th>Nettoerlös/Einheit</th>
          <th>Profit/Einheit</th>
          <th>Marge %</th>
          <th>Profit/Craft</th>
          <th>Fokuskosten</th>
          <th>Silber/Fokus</th>
          <th>Preis-Alter (h)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={`${row.recipe.itemId}.${row.recipe.enchant}`}
            className={row.result.noPriceData ? 'row-no-price-data' : (row.result.profitPerUnit ?? 0) > 0 ? 'row-profit' : 'row-loss'}
          >
            <td>
              {row.recipe.name}
              {row.recipe.itemValueIsEstimate && (
                <span title="Item-Value geschätzt (Summe der Zutaten) — Gebühr ist approximativ"> *</span>
              )}
            </td>
            <td>{row.recipe.tier}</td>
            <td>{row.recipe.enchant}</td>
            {row.result.noPriceData ? (
              <td colSpan={11}>NO PRICE DATA</td>
            ) : (
              <>
                <td>{formatSilver(row.result.materialCost!)}</td>
                <td>{formatSilver(row.result.fee!)}</td>
                <td>{formatSilver(row.result.costPerUnit!)}</td>
                <td>{row.sellPrice !== null ? formatSilver(row.sellPrice) : '—'}</td>
                <td>{formatSilver(row.result.netRevenue!)}</td>
                <td>{formatSilver(row.result.profitPerUnit!)}</td>
                <td>{(row.result.marginPct! * 100).toFixed(1)}%</td>
                <td>{formatSilver(row.result.profitPerBatch!)}</td>
                <td>{formatInt(row.recipe.focusCost)}</td>
                <td>{row.result.silverPerFocus !== null ? formatRatio(row.result.silverPerFocus!) : '—'}</td>
                <td>{row.priceAgeHours !== null ? row.priceAgeHours.toFixed(1) : '—'}</td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
