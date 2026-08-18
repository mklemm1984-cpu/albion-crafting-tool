import type { Recipe, RawRecipeRow } from './types';
import { fromRawRecipeRow } from './types';

const DEFAULT_RECIPES_URL = `${import.meta.env.BASE_URL}data/recipes.json`;

export async function loadRecipes(url: string = DEFAULT_RECIPES_URL): Promise<Recipe[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load recipes from ${url}: HTTP ${response.status}`);
  }
  const raw: RawRecipeRow[] = await response.json();
  return raw.map(fromRawRecipeRow);
}
