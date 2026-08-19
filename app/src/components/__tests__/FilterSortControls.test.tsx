import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterSortControls, DEFAULT_FILTERS } from '../FilterSortControls';
import { matchesStructuralFilters } from '../FilterSortControls';

describe('FilterSortControls', () => {
  it('calls onChange with the updated category', () => {
    const onChange = vi.fn();
    render(<FilterSortControls filters={DEFAULT_FILTERS} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Kategorie'), { target: { value: 'weapon' } });
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, category: 'weapon' });
  });

  it('calls onChange with the updated sort key', () => {
    const onChange = vi.fn();
    render(<FilterSortControls filters={DEFAULT_FILTERS} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Sortieren nach'), { target: { value: 'silverPerFocus' } });
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, sortKey: 'silverPerFocus' });
  });
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
