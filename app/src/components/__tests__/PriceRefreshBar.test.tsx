import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PriceRefreshBar } from '../PriceRefreshBar';
import * as aodpClient from '../../data/aodpClient';
import * as priceCache from '../../data/priceCache';
import { DEFAULT_CONFIG } from '../../state/ConfigContext';
import type { Recipe } from '../../data/types';

const RECIPE: Recipe = {
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
  materials: [{ id: 'T4_FIBER', count: 2 }],
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('PriceRefreshBar', () => {
  it('fetches prices for the visible recipes and their materials, then saves and calls onDone', async () => {
    const fetchSpy = vi.spyOn(aodpClient, 'fetchPrices').mockResolvedValue([]);
    const saveSpy = vi.spyOn(priceCache, 'savePrices').mockImplementation(() => {});
    const onDone = vi.fn();

    render(
      <PriceRefreshBar visibleRecipes={[RECIPE]} allRecipes={[RECIPE]} config={DEFAULT_CONFIG} onDone={onDone} />
    );

    fireEvent.click(screen.getByText('Preise aktualisieren (gefilterte Ansicht)'));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ itemIds: expect.arrayContaining(['T4_CLOTH', 'T4_FIBER']) })
    );
    expect(saveSpy).toHaveBeenCalled();
  });

  it('shows an error message when the fetch fails', async () => {
    vi.spyOn(aodpClient, 'fetchPrices').mockRejectedValue(new Error('network down'));

    render(
      <PriceRefreshBar visibleRecipes={[RECIPE]} allRecipes={[RECIPE]} config={DEFAULT_CONFIG} onDone={vi.fn()} />
    );

    fireEvent.click(screen.getByText('Preise aktualisieren (gefilterte Ansicht)'));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('network down'));
  });

  it('disables both buttons synchronously on click, before the fetch resolves', async () => {
    let resolveFetch: (value: never[]) => void = () => {};
    const pending = new Promise<never[]>((resolve) => {
      resolveFetch = resolve;
    });
    vi.spyOn(aodpClient, 'fetchPrices').mockReturnValue(pending);
    vi.spyOn(priceCache, 'savePrices').mockImplementation(() => {});

    render(
      <PriceRefreshBar visibleRecipes={[RECIPE]} allRecipes={[RECIPE]} config={DEFAULT_CONFIG} onDone={vi.fn()} />
    );

    const scopedButton = screen.getByText('Preise aktualisieren (gefilterte Ansicht)');
    const allButton = screen.getByText('Alle laden');

    fireEvent.click(scopedButton);

    expect(scopedButton).toBeDisabled();
    expect(allButton).toBeDisabled();

    resolveFetch([]);
    await waitFor(() => expect(scopedButton).not.toBeDisabled());
  });

  it('re-enables the buttons instead of getting stuck when item-id collection throws', async () => {
    // Simulates corrupt/malformed recipe data (materials not iterable), which
    // makes collectItemIds() throw synchronously. This guards against a
    // regression where that throw happened outside the try block and skipped
    // catch/finally, leaving isRefreshing stuck true (buttons permanently
    // disabled with no error shown and no recovery short of remounting).
    const brokenRecipe = { ...RECIPE, materials: null as unknown as Recipe['materials'] };
    const fetchSpy = vi.spyOn(aodpClient, 'fetchPrices');

    render(
      <PriceRefreshBar
        visibleRecipes={[brokenRecipe]}
        allRecipes={[brokenRecipe]}
        config={DEFAULT_CONFIG}
        onDone={vi.fn()}
      />
    );

    const scopedButton = screen.getByText('Preise aktualisieren (gefilterte Ansicht)');
    fireEvent.click(scopedButton);

    await waitFor(() => expect(scopedButton).not.toBeDisabled());
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
