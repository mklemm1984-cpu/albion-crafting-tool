import React, { useMemo } from 'react';
import type { Recipe } from '../data/types';
import type { CalcConfig } from '../state/ConfigContext';
import { BASE_CITY_BONUS } from '../state/ConfigContext';
import { craftingSpecCity, refiningSpecCity } from '../data/citySpecializations';
import { getPrice, getPriceAgeHours } from '../data/priceCache';
import { resourceReturnRate } from '../calc/returnRate';
import { craftProfit, CraftProfitResult } from '../calc/profit';
import type { Filters } from './FilterSortControls';

interface DashboardRow {
  recipe: Recipe;
  result: CraftProfitResult;
  priceAgeHours: number | null;
}

function buildRow(recipe: Recipe, config: CalcConfig): DashboardRow {
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
    const quote = getPrice(m.id, config.buyCity);
    const price = config.buyMode === 'instant' ? quote?.sellPriceMin : quote?.buyPriceMax;
    return { id: m.id, count: m.count, price: price ?? null };
  });

  const sellQuote = getPrice(recipe.itemId, config.sellCity);
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

  const priceAgeHours = getPriceAgeHours(recipe.itemId, config.sellCity);

  return { recipe, result, priceAgeHours };
}

function applyFilters(rows: DashboardRow[], filters: Filters): DashboardRow[] {
  return rows.filter((row) => {
    if (filters.category && row.recipe.category !== filters.category) return false;
    if (filters.tier !== '' && row.recipe.tier !== filters.tier) return false;
    if (filters.enchant !== '' && row.recipe.enchant !== filters.enchant) return false;
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
    const built = recipes.map((r) => buildRow(r, config));
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
          <th>Kosten/Einheit</th>
          <th>Nettoerlös/Einheit</th>
          <th>Profit/Einheit</th>
          <th>Marge %</th>
          <th>Profit/Craft</th>
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
              <td colSpan={7}>NO PRICE DATA</td>
            ) : (
              <>
                <td>{row.result.costPerUnit!.toFixed(2)}</td>
                <td>{row.result.netRevenue!.toFixed(2)}</td>
                <td>{row.result.profitPerUnit!.toFixed(2)}</td>
                <td>{(row.result.marginPct! * 100).toFixed(1)}%</td>
                <td>{row.result.profitPerBatch!.toFixed(2)}</td>
                <td>{row.result.silverPerFocus?.toFixed(3) ?? '—'}</td>
                <td>{row.priceAgeHours !== null ? row.priceAgeHours.toFixed(1) : '—'}</td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
