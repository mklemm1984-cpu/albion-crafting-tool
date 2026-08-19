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
  silverCost: 0,
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

    // NOTE: the underlying value is 247.565536... (247.57, not the
    // master-prompt doc's 247.55 — the doc's worked example manually
    // rounded RRR to 4dp before multiplying through the materials sum, see
    // calc_reference.py's SHARED_RRR comment in Task 6; the Dashboard keeps
    // full float precision for the actual calculation). Silver amounts have
    // no fractional unit in Albion, so the display rounds to the nearest
    // whole silver: 247.565536 -> "248".
    //
    // DEVIATION FROM BRIEF: outputAmount is 1 for CLOTH_RECIPE, so
    // profitPerBatch === profitPerUnit and the value "248" legitimately
    // renders in both the Profit/Einheit and Profit/Craft cells. That makes
    // screen.getByText('248') throw ("multiple elements found") even
    // though the computed number is exactly right. Using getAllByText here
    // (instead of the brief's getByText) fixes the query without touching
    // the asserted value or any calc/display logic.
    expect(screen.getAllByText('248').length).toBeGreaterThan(0);
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

  it('applies the refining specialization bonus when buyCity matches (higher RRR -> lower material cost)', () => {
    savePrices([
      { itemId: 'T4_FIBER', city: 'Lymhurst', sellPriceMin: 200, sellPriceMinDate: '', buyPriceMax: 0, buyPriceMaxDate: '' },
      { itemId: 'T3_CLOTH', city: 'Lymhurst', sellPriceMin: 150, sellPriceMinDate: '', buyPriceMax: 0, buyPriceMaxDate: '' },
      { itemId: 'T4_CLOTH', city: 'Caerleon', sellPriceMin: 600, sellPriceMinDate: '', buyPriceMax: 0, buyPriceMaxDate: '' },
    ]);
    const configWithLymhurstBuy = { ...DEFAULT_CONFIG, buyCity: 'Lymhurst' };

    render(<Dashboard recipes={[CLOTH_RECIPE]} config={configWithLymhurstBuy} filters={DEFAULT_FILTERS} />);

    // Lymhurst is T4_CLOTH's refining spec city -> specBonus 0.40.
    // bonus = 0.18+0.40+0.59 = 1.17, RRR = 1.17/2.17 ≈ 0.53917.
    // materialCost = 550*(1-0.53917) ≈ 253.46 -> rounds to "253" (no
    // fractional silver) — visibly lower than the ~311 seen in the
    // zero-bonus test, proving the spec bonus is actually applied (not
    // hardcoded to 0).
    expect(screen.getByText('253')).toBeInTheDocument();
  });

  it('formats large silver amounts with German thousands separators and no decimals', () => {
    const bigPriceRecipe: Recipe = { ...CLOTH_RECIPE, itemId: 'T8_BIGITEM', name: 'Big Item' };
    savePrices([
      { itemId: 'T4_FIBER', city: 'Caerleon', sellPriceMin: 200000, sellPriceMinDate: '', buyPriceMax: 0, buyPriceMaxDate: '' },
      { itemId: 'T3_CLOTH', city: 'Caerleon', sellPriceMin: 150000, sellPriceMinDate: '', buyPriceMax: 0, buyPriceMaxDate: '' },
      { itemId: 'T8_BIGITEM', city: 'Caerleon', sellPriceMin: 600000, sellPriceMinDate: '', buyPriceMax: 0, buyPriceMaxDate: '' },
    ]);

    render(<Dashboard recipes={[bigPriceRecipe]} config={DEFAULT_CONFIG} filters={DEFAULT_FILTERS} />);

    // materialCost = (400000+150000)*(1-0.4350282...) ≈ 310734.46, rounded
    // to the nearest whole silver -> "310.734" (dot every 3 digits, no
    // decimals -- Albion silver has no fractional unit).
    expect(screen.getByText('310.734')).toBeInTheDocument();
  });
});
