import citySpecData from './city_specializations.json';

export interface CitySpecializationData {
  craftingBySubcategory: Record<string, string>;
  craftingByShopCategory: Record<string, string>;
  craftingCapesPrefix: Record<string, string>;
  refiningByIdSubstring: Record<string, string>;
}

const DATA = citySpecData as unknown as CitySpecializationData;

/** The refined-resource ID substrings this module already matches against
 * for city specialization (PLANKS/CLOTH/STONEBLOCK/LEATHER/METALBAR) --
 * exported so the item-taxonomy module can reuse the same list for its
 * "Material" filter under Rohstoff-Veredelung instead of re-typing it. */
export const REFINED_MATERIAL_SUBSTRINGS: readonly string[] = Object.keys(DATA.refiningByIdSubstring);

/**
 * Returns the city that gives a +15% crafting specialization bonus for this
 * recipe (weapon/equipment/consumable/mount), or null if none applies.
 */
export function craftingSpecCity(recipe: {
  category: string;
  shopCategory: string;
  shopSubCategory: string;
}): string | null {
  if (recipe.category === 'simpleitem') return null; // refining, not crafting

  for (const [prefix, city] of Object.entries(DATA.craftingCapesPrefix)) {
    if (recipe.shopSubCategory.startsWith(prefix)) return city;
  }
  if (DATA.craftingByShopCategory[recipe.shopCategory]) {
    return DATA.craftingByShopCategory[recipe.shopCategory];
  }
  return DATA.craftingBySubcategory[recipe.shopSubCategory] ?? null;
}

/**
 * Returns the city that gives a +40% refining specialization bonus for this
 * refined-resource recipe, or null if none applies.
 */
export function refiningSpecCity(recipe: { category: string; itemId: string }): string | null {
  if (recipe.category !== 'simpleitem') return null;
  for (const [substring, city] of Object.entries(DATA.refiningByIdSubstring)) {
    if (recipe.itemId.includes(substring)) return city;
  }
  return null;
}
