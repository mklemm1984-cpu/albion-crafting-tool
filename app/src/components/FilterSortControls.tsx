import React from 'react';
import { deriveMaterial, deriveSlotOrType, deriveFamilyId, deriveFamilyName } from '../data/itemTaxonomy';
import type { Recipe } from '../data/types';

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

type TaxonomyRecipe = Pick<Recipe, 'category' | 'tier' | 'enchant' | 'shopSubCategory' | 'itemId' | 'name'>;

function recipesMatchingUpTo(recipes: TaxonomyRecipe[], filters: Filters, upTo: 'category' | 'material' | 'slot'): TaxonomyRecipe[] {
  return recipes.filter((r) => {
    if (filters.category && r.category !== filters.category) return false;
    if (upTo === 'category') return true;
    if (filters.material && deriveMaterial(r) !== filters.material) return false;
    if (upTo === 'material') return true;
    if (filters.slot && deriveSlotOrType(r) !== filters.slot) return false;
    return true;
  });
}

function distinctSorted(values: (string | null)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => v !== null))).sort();
}

export function FilterSortControls({
  filters,
  onChange,
  recipes,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
  recipes: Recipe[];
}) {
  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    let next: Filters = { ...filters, [key]: value };
    if (key === 'category') next = { ...next, material: '', slot: '', family: '' };
    if (key === 'material') next = { ...next, slot: '', family: '' };
    if (key === 'slot') next = { ...next, family: '' };
    onChange(next);
  }

  const materialCandidates = recipesMatchingUpTo(recipes, filters, 'category');
  const materialOptions = distinctSorted(materialCandidates.map(deriveMaterial));

  const slotCandidates = recipesMatchingUpTo(recipes, filters, 'material');
  const slotOptions = distinctSorted(slotCandidates.map(deriveSlotOrType));

  const familyCandidates = recipesMatchingUpTo(recipes, filters, 'slot');
  const familyMap = new Map<string, string>();
  for (const r of familyCandidates) {
    familyMap.set(deriveFamilyId(r), deriveFamilyName(r));
  }
  const familyOptions = Array.from(familyMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));

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

      {materialOptions.length > 0 && (
        <label>
          Material
          <select value={filters.material} onChange={(e) => update('material', e.target.value)}>
            <option value="">Alle</option>
            {materialOptions.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
      )}

      {slotOptions.length > 0 && (
        <label>
          {filters.category === 'equipmentitem' ? 'Slot' : 'Typ'}
          <select value={filters.slot} onChange={(e) => update('slot', e.target.value)}>
            <option value="">Alle</option>
            {slotOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      )}

      {familyOptions.length > 0 && (
        <label>
          Familie
          <input
            key={`${filters.category}|${filters.material}|${filters.slot}`}
            list="family-options"
            defaultValue={familyMap.get(filters.family) ?? ''}
            onChange={(e) => {
              const match = familyOptions.find(([, name]) => name === e.target.value);
              update('family', match ? match[0] : '');
            }}
          />
          <datalist id="family-options">
            {familyOptions.map(([id, name]) => (
              <option key={id} value={name} />
            ))}
          </datalist>
        </label>
      )}

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
