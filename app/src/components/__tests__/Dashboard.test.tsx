import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Dashboard } from '../Dashboard';
import { savePrices, clearPriceCache } from '../../data/priceCache';
import { DEFAULT_CONFIG } from '../../state/ConfigContext';
import { DEFAULT_FILTERS } from '../FilterSortControls';
import type { Recipe } from '../../data/types';

const CLOTH_RECIPE: Recipe = {
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
  materials: [
    { id: 'T4_FIBER', count: 2 },
    { id: 'T3_CLOTH', count: 1 },
  ],
};

beforeEach(() => {
  clearPriceCache();
});

describe('Dashboard', () => {
  it('shows NO PRICE DATA when prices are missing', () => {
    render(<Dashboard recipes={[CLOTH_RECIPE]} config={DEFAULT_CONFIG} filters={DEFAULT_FILTERS} />);
    expect(screen.getByText('NO PRICE DATA')).toBeInTheDocument();
  });

  it('computes profit once prices are cached, using the same formulas as the acceptance tests', () => {
    savePrices([
      { itemId: 'T4_FIBER', city: 'Caerleon', sellPriceMin: 200, sellPriceMinDate: '', buyPriceMax: 0, buyPriceMaxDate: '' },
      { itemId: 'T3_CLOTH', city: 'Caerleon', sellPriceMin: 150, sellPriceMinDate: '', buyPriceMax: 0, buyPriceMaxDate: '' },
      { itemId: 'T4_CLOTH', city: 'Caerleon', sellPriceMin: 600, sellPriceMinDate: '', buyPriceMax: 0, buyPriceMaxDate: '' },
    ]);

    render(<Dashboard recipes={[CLOTH_RECIPE]} config={DEFAULT_CONFIG} filters={DEFAULT_FILTERS} />);

    // NOTE: this is 247.57, not the master-prompt doc's 247.55 — the doc's
    // worked example manually rounded RRR to 4dp before multiplying through
    // the materials sum (see calc_reference.py's SHARED_RRR comment in Task
    // 6). The Dashboard, like resourceReturnRate() itself, intentionally
    // keeps full float precision for real money math, so it lands 0.02
    // silver away from the hand-rounded documentation example — both are
    // "correct" for what they're each doing.
    //
    // DEVIATION FROM BRIEF: outputAmount is 1 for CLOTH_RECIPE, so
    // profitPerBatch === profitPerUnit and the value "247.57" legitimately
    // renders in both the Profit/Einheit and Profit/Craft cells. That makes
    // screen.getByText('247.57') throw ("multiple elements found") even
    // though the computed number is exactly right. Using getAllByText here
    // (instead of the brief's getByText) fixes the query without touching
    // the asserted value or any calc/display logic.
    expect(screen.getAllByText('247.57').length).toBeGreaterThan(0);
  });

  it('marks estimated item values (e.g. potions/food) so the fee is understood as approximate', () => {
    const estimatedRecipe: Recipe = { ...CLOTH_RECIPE, itemId: 'T4_POTION_HEAL', name: 'Heiltrank', itemValueIsEstimate: true };
    savePrices([
      { itemId: 'T4_FIBER', city: 'Caerleon', sellPriceMin: 200, sellPriceMinDate: '', buyPriceMax: 0, buyPriceMaxDate: '' },
      { itemId: 'T3_CLOTH', city: 'Caerleon', sellPriceMin: 150, sellPriceMinDate: '', buyPriceMax: 0, buyPriceMaxDate: '' },
      { itemId: 'T4_POTION_HEAL', city: 'Caerleon', sellPriceMin: 600, sellPriceMinDate: '', buyPriceMax: 0, buyPriceMaxDate: '' },
    ]);

    render(<Dashboard recipes={[estimatedRecipe]} config={DEFAULT_CONFIG} filters={DEFAULT_FILTERS} />);

    expect(screen.getByTitle('Item-Value geschätzt (Summe der Zutaten) — Gebühr ist approximativ')).toBeInTheDocument();
  });
});
