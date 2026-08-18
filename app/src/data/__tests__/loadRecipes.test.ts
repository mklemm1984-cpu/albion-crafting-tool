import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadRecipes } from '../loadRecipes';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadRecipes', () => {
  it('maps raw snake_case rows to typed Recipe objects', async () => {
    const raw = [
      {
        item_id: 'T4_CLOTH',
        name: 'Fine Cloth',
        tier: 4,
        enchant: 0,
        category: 'simpleitem',
        shop_category: 'crafting',
        shop_subcategory: 'refinedresources',
        output_amount: 1,
        item_value: 16,
        item_value_is_estimate: false,
        focus_cost: 54,
        materials: [{ id: 'T4_FIBER', count: 2 }],
      },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(raw) })
    );

    const recipes = await loadRecipes('/data/recipes.json');
    expect(recipes).toHaveLength(1);
    expect(recipes[0].itemId).toBe('T4_CLOTH');
    expect(recipes[0].shopSubCategory).toBe('refinedresources');
    expect(recipes[0].materials).toEqual([{ id: 'T4_FIBER', count: 2 }]);
  });

  it('throws a readable error on a failed fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(loadRecipes('/data/recipes.json')).rejects.toThrow('HTTP 404');
  });
});
