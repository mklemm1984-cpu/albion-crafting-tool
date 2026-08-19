import React from 'react';
import { deriveMaterial, deriveSlotOrType, deriveFamilyId } from '../data/itemTaxonomy';

export type SortKey = 'profitPerUnit' | 'silverPerFocus';

export interface Filters {
  category: string;
  tier: number | '';
  enchant: number | '';
  material: string;
  slot: string;
  family: string;
  onlyProfitable: boolean;
  sortKey: SortKey;
}

export const DEFAULT_FILTERS: Filters = {
  category: '',
  tier: '',
  enchant: '',
  material: '',
  slot: '',
  family: '',
  onlyProfitable: false,
  sortKey: 'profitPerUnit',
};

const CATEGORIES = ['simpleitem', 'equipmentitem', 'weapon', 'transformationweapon', 'consumableitem', 'mount', 'farmableitem'];

export const CATEGORY_LABELS: Record<string, string> = {
  simpleitem: 'Rohstoff-Veredelung',
  equipmentitem: 'Rüstung',
  weapon: 'Waffen',
  transformationweapon: 'Shapeshifter Staves',
  consumableitem: 'Verbrauchsgüter',
  mount: 'Mounts',
  farmableitem: 'Farming',
};

/** Shared category/tier/enchant predicate used by both App.tsx (for the
 * PriceRefreshBar's "filtered view" recipe list) and Dashboard.tsx's
 * applyFilters, so the two stay in sync by construction instead of by
 * copy-paste. `onlyProfitable` is handled separately by Dashboard, since it
 * depends on computed profit data that App.tsx doesn't have. */
export function matchesStructuralFilters(
  recipe: { category: string; tier: number; enchant: number; shopSubCategory: string; itemId: string; name: string },
  filters: Filters
): boolean {
  if (filters.category && recipe.category !== filters.category) return false;
  if (filters.tier !== '' && recipe.tier !== filters.tier) return false;
  if (filters.enchant !== '' && recipe.enchant !== filters.enchant) return false;
  if (filters.material && deriveMaterial(recipe) !== filters.material) return false;
  if (filters.slot && deriveSlotOrType(recipe) !== filters.slot) return false;
  if (filters.family && deriveFamilyId(recipe) !== filters.family) return false;
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
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
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
