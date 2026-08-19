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
    expect(optionValues).toEqual(['', 'leather', 'plate']);
  });

  it('does not show a Material dropdown for weapon (no material axis)', () => {
    const onChange = vi.fn();
    const filters = { ...DEFAULT_FILTERS, category: 'weapon' };
    render(<FilterSortControls filters={filters} onChange={onChange} recipes={RECIPES} />);
    expect(screen.queryByLabelText('Material')).toBeNull();
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
