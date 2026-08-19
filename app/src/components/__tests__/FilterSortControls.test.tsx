import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterSortControls, DEFAULT_FILTERS, matchesStructuralFilters } from '../FilterSortControls';
import type { Recipe } from '../../data/types';

function recipe(overrides: Partial<Recipe>): Recipe {
  return {
    itemId: 'T4_CLOTH',
    name: 'Fine Cloth',
    tier: 4,
    enchant: 0,
    category: 'simpleitem',
    shopCategory: 'crafting',
    shopSubCategory: 'refinedresources',
    outputAmount: 1,
    itemValue: 16,
    itemValueIsEstimate: false,
    focusCost: 54,
    materials: [],
    silverCost: 0,
    ...overrides,
  };
}

const RECIPES: Recipe[] = [
  recipe({ itemId: 'T4_CLOTH', name: 'Fine Cloth', category: 'simpleitem', shopSubCategory: 'refinedresources' }),
  recipe({ itemId: 'T4_PLANKS', name: 'Fine Planks', category: 'simpleitem', shopSubCategory: 'refinedresources' }),
  recipe({
    itemId: 'T6_SHOES_LEATHER_MORGANA',
    name: "Master's Stalker Shoes",
    tier: 6,
    category: 'equipmentitem',
    shopSubCategory: 'leather_shoes',
  }),
  recipe({
    itemId: 'T6_SHOES_LEATHER_SET1',
    name: "Master's Mercenary Shoes",
    tier: 6,
    category: 'equipmentitem',
    shopSubCategory: 'leather_shoes',
  }),
  recipe({
    itemId: 'T6_HEAD_PLATE_SET1',
    name: "Master's Soldier Helmet",
    tier: 6,
    category: 'equipmentitem',
    shopSubCategory: 'plate_helmet',
  }),
  // T1-only row so cascading-by-tier tests (Fix #2) have something that
  // exists at one tier but not another.
  recipe({
    itemId: 'T1_HEAD_CLOTH_SET1',
    name: "Beginner's Scholar Cowl",
    tier: 1,
    category: 'equipmentitem',
    shopSubCategory: 'cloth_helmet',
  }),
];

describe('FilterSortControls', () => {
  it('calls onChange with the updated category', () => {
    const onChange = vi.fn();
    render(<FilterSortControls filters={DEFAULT_FILTERS} onChange={onChange} recipes={RECIPES} />);
    fireEvent.change(screen.getByLabelText('Kategorie'), { target: { value: 'weapon' } });
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, category: 'weapon' });
  });

  it('calls onChange with the updated sort key', () => {
    const onChange = vi.fn();
    render(<FilterSortControls filters={DEFAULT_FILTERS} onChange={onChange} recipes={RECIPES} />);
    fireEvent.change(screen.getByLabelText('Sortieren nach'), { target: { value: 'silverPerFocus' } });
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, sortKey: 'silverPerFocus' });
  });

  it('shows a Material dropdown scoped to the selected category, with only the materials present there', () => {
    const onChange = vi.fn();
    const filters = { ...DEFAULT_FILTERS, category: 'equipmentitem' };
    render(<FilterSortControls filters={filters} onChange={onChange} recipes={RECIPES} />);
    const materialSelect = screen.getByLabelText('Material') as HTMLSelectElement;
    const optionValues = Array.from(materialSelect.options).map((o) => o.value);
    expect(optionValues).toEqual(['', 'cloth', 'leather', 'plate']);
  });

  it('does not show a Material dropdown for weapon (no material axis)', () => {
    const onChange = vi.fn();
    const filters = { ...DEFAULT_FILTERS, category: 'weapon' };
    render(<FilterSortControls filters={filters} onChange={onChange} recipes={RECIPES} />);
    expect(screen.queryByLabelText('Material')).toBeNull();
  });

  it('scopes the Material dropdown by Tier, excluding materials only present at other tiers', () => {
    // Regression for finding #2: Kategorie=equipmentitem + Tier=6 must not
    // offer "cloth" as a Material option, since the only cloth row
    // (T1_HEAD_CLOTH_SET1) exists at T1, not T6.
    const onChange = vi.fn();
    const filters = { ...DEFAULT_FILTERS, category: 'equipmentitem', tier: 6 as const };
    render(<FilterSortControls filters={filters} onChange={onChange} recipes={RECIPES} />);
    const materialSelect = screen.getByLabelText('Material') as HTMLSelectElement;
    const optionValues = Array.from(materialSelect.options).map((o) => o.value);
    expect(optionValues).toEqual(['', 'leather', 'plate']);
  });

  it('scopes the Slot dropdown by Enchant, excluding slots only present at other enchant levels', () => {
    // Regression for finding #2: enchant must also narrow the cascade, not
    // just category -- mirrors the tier case using the same T1 fixture row
    // (enchant 0) vs. an enchant-1-only row.
    const onChange = vi.fn();
    const enchantedRecipes = [
      ...RECIPES,
      recipe({
        itemId: 'T6_SHOES_LEATHER_MORGANA@1',
        name: "Master's Stalker Shoes .1",
        tier: 6,
        enchant: 1,
        category: 'equipmentitem',
        shopSubCategory: 'leather_boots_enchant_only',
      }),
    ];
    const filters = { ...DEFAULT_FILTERS, category: 'equipmentitem', enchant: 0 as const };
    render(<FilterSortControls filters={filters} onChange={onChange} recipes={enchantedRecipes} />);
    const slotSelect = screen.getByLabelText('Slot') as HTMLSelectElement;
    const optionValues = Array.from(slotSelect.options).map((o) => o.value);
    // deriveSlotOrType strips the material prefix ('leather_') from
    // shopSubCategory, so the rendered option value is 'boots_enchant_only',
    // not the raw 'leather_boots_enchant_only' shopSubCategory string.
    expect(optionValues).not.toContain('boots_enchant_only');
  });

  it('hides Material/Slot/Familie when Kategorie is Alle (unset)', () => {
    // Regression for finding #4: the default landing state (no category
    // selected) must not render dropdowns whose option sets mix unrelated
    // casing/meaning (uppercase refined-resource substrings vs. lowercase
    // armor materials).
    const onChange = vi.fn();
    render(<FilterSortControls filters={DEFAULT_FILTERS} onChange={onChange} recipes={RECIPES} />);
    expect(screen.queryByLabelText('Material')).toBeNull();
    expect(screen.queryByLabelText('Slot')).toBeNull();
    expect(screen.queryByLabelText('Typ')).toBeNull();
    expect(screen.queryByLabelText('Familie')).toBeNull();
  });

  it('scopes the Slot dropdown to the selected Material', () => {
    const onChange = vi.fn();
    const filters = { ...DEFAULT_FILTERS, category: 'equipmentitem', material: 'leather' };
    render(<FilterSortControls filters={filters} onChange={onChange} recipes={RECIPES} />);
    const slotSelect = screen.getByLabelText('Slot') as HTMLSelectElement;
    const optionValues = Array.from(slotSelect.options).map((o) => o.value);
    expect(optionValues).toEqual(['', 'shoes']);
  });

  it('resets material/slot/family when category changes', () => {
    const onChange = vi.fn();
    const filters = { ...DEFAULT_FILTERS, category: 'equipmentitem', material: 'leather', slot: 'shoes', family: 'SHOES_LEATHER_SET1' };
    render(<FilterSortControls filters={filters} onChange={onChange} recipes={RECIPES} />);
    fireEvent.change(screen.getByLabelText('Kategorie'), { target: { value: 'weapon' } });
    expect(onChange).toHaveBeenCalledWith({ ...filters, category: 'weapon', material: '', slot: '', family: '' });
  });

  it('resets slot/family when material changes', () => {
    const onChange = vi.fn();
    const filters = { ...DEFAULT_FILTERS, category: 'equipmentitem', material: 'leather', slot: 'shoes', family: 'SHOES_LEATHER_SET1' };
    render(<FilterSortControls filters={filters} onChange={onChange} recipes={RECIPES} />);
    fireEvent.change(screen.getByLabelText('Material'), { target: { value: 'plate' } });
    expect(onChange).toHaveBeenCalledWith({ ...filters, material: 'plate', slot: '', family: '' });
  });

  it('offers a searchable Familie datalist scoped to category+material+slot, keyed by family id', () => {
    const onChange = vi.fn();
    const filters = { ...DEFAULT_FILTERS, category: 'equipmentitem', material: 'leather', slot: 'shoes' };
    render(<FilterSortControls filters={filters} onChange={onChange} recipes={RECIPES} />);
    fireEvent.change(screen.getByLabelText('Familie'), { target: { value: 'Stalker Shoes' } });
    expect(onChange).toHaveBeenCalledWith({ ...filters, family: 'SHOES_LEATHER_MORGANA' });
  });

  it('clears the Familie input text when a cascading reset zeroes out the family filter', () => {
    const onChange = vi.fn();
    const filters = {
      ...DEFAULT_FILTERS,
      category: 'equipmentitem',
      material: 'leather',
      slot: 'shoes',
      family: 'SHOES_LEATHER_MORGANA',
    };
    const { rerender } = render(<FilterSortControls filters={filters} onChange={onChange} recipes={RECIPES} />);
    expect((screen.getByLabelText('Familie') as HTMLInputElement).value).toBe('Stalker Shoes');

    const nextFilters = { ...filters, material: 'plate', slot: '', family: '' };
    rerender(<FilterSortControls filters={nextFilters} onChange={onChange} recipes={RECIPES} />);

    expect((screen.getByLabelText('Familie') as HTMLInputElement).value).toBe('');
  });

  it('does not call onChange again for non-matching Familie keystrokes once family is already empty', () => {
    // Regression for finding #5: typing text that matches no family option
    // must not keep calling onChange with a redundant identical
    // family: '' update on every keystroke (invalidates memoized profit
    // computation upstream).
    const onChange = vi.fn();
    const filters = { ...DEFAULT_FILTERS, category: 'equipmentitem', material: 'leather', slot: 'shoes' };
    render(<FilterSortControls filters={filters} onChange={onChange} recipes={RECIPES} />);
    const familyInput = screen.getByLabelText('Familie');

    fireEvent.change(familyInput, { target: { value: 'zz' } });
    fireEvent.change(familyInput, { target: { value: 'zzq' } });

    expect(onChange).not.toHaveBeenCalled();
  });

  describe('matchesStructuralFilters', () => {
    const clothRecipe = {
      category: 'simpleitem',
      tier: 4,
      enchant: 0,
      shopSubCategory: 'refinedresources',
      itemId: 'T4_CLOTH',
      name: 'Fine Cloth',
    };

    it('matches everything when no filters are set', () => {
      expect(matchesStructuralFilters(clothRecipe, DEFAULT_FILTERS)).toBe(true);
    });

    it('filters by material', () => {
      expect(matchesStructuralFilters(clothRecipe, { ...DEFAULT_FILTERS, material: 'CLOTH' })).toBe(true);
      expect(matchesStructuralFilters(clothRecipe, { ...DEFAULT_FILTERS, material: 'PLANKS' })).toBe(false);
    });

    it('filters by slot', () => {
      const shoes = { category: 'equipmentitem', tier: 6, enchant: 0, shopSubCategory: 'leather_shoes', itemId: 'T6_SHOES_LEATHER_MORGANA', name: "Master's Stalker Shoes" };
      expect(matchesStructuralFilters(shoes, { ...DEFAULT_FILTERS, slot: 'shoes' })).toBe(true);
      expect(matchesStructuralFilters(shoes, { ...DEFAULT_FILTERS, slot: 'helmet' })).toBe(false);
    });

    it('filters by family', () => {
      expect(matchesStructuralFilters(clothRecipe, { ...DEFAULT_FILTERS, family: 'CLOTH' })).toBe(true);
      expect(matchesStructuralFilters(clothRecipe, { ...DEFAULT_FILTERS, family: 'PLANKS' })).toBe(false);
    });
  });
});
