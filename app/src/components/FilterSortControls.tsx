import React from 'react';

export type SortKey = 'profitPerUnit' | 'silverPerFocus';

export interface Filters {
  category: string;
  tier: number | '';
  enchant: number | '';
  onlyProfitable: boolean;
  sortKey: SortKey;
}

export const DEFAULT_FILTERS: Filters = {
  category: '',
  tier: '',
  enchant: '',
  onlyProfitable: false,
  sortKey: 'profitPerUnit',
};

const CATEGORIES = ['simpleitem', 'equipmentitem', 'weapon', 'consumableitem', 'mount'];

/** Shared category/tier/enchant predicate used by both App.tsx (for the
 * PriceRefreshBar's "filtered view" recipe list) and Dashboard.tsx's
 * applyFilters, so the two stay in sync by construction instead of by
 * copy-paste. `onlyProfitable` is handled separately by Dashboard, since it
 * depends on computed profit data that App.tsx doesn't have. */
export function matchesStructuralFilters(
  recipe: { category: string; tier: number; enchant: number },
  filters: Filters
): boolean {
  if (filters.category && recipe.category !== filters.category) return false;
  if (filters.tier !== '' && recipe.tier !== filters.tier) return false;
  if (filters.enchant !== '' && recipe.enchant !== filters.enchant) return false;
  return true;
}

export function FilterSortControls({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
}) {
  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <section className="filter-sort-controls" aria-label="Filter & Sortierung">
      <label>
        Kategorie
        <select value={filters.category} onChange={(e) => update('category', e.target.value)}>
          <option value="">Alle</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>

      <label>
        Tier
        <select value={filters.tier} onChange={(e) => update('tier', e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">Alle</option>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((t) => (
            <option key={t} value={t}>T{t}</option>
          ))}
        </select>
      </label>

      <label>
        Enchant
        <select value={filters.enchant} onChange={(e) => update('enchant', e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">Alle</option>
          {[0, 1, 2, 3, 4].map((lvl) => (
            <option key={lvl} value={lvl}>.{lvl}</option>
          ))}
        </select>
      </label>

      <label>
        <input type="checkbox" checked={filters.onlyProfitable} onChange={(e) => update('onlyProfitable', e.target.checked)} />
        Nur profitabel
      </label>

      <label>
        Sortieren nach
        <select value={filters.sortKey} onChange={(e) => update('sortKey', e.target.value as SortKey)}>
          <option value="profitPerUnit">Profit / Einheit</option>
          <option value="silverPerFocus">Silber / Fokus</option>
        </select>
      </label>
    </section>
  );
}
