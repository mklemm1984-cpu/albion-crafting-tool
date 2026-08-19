export interface RecipeMaterial {
  id: string;
  count: number;
}

export interface Recipe {
  itemId: string;
  name: string;
  tier: number;
  enchant: number;
  category: string;
  shopCategory: string;
  shopSubCategory: string;
  outputAmount: number;
  itemValue: number;
  itemValueIsEstimate: boolean;
  focusCost: number;
  materials: RecipeMaterial[];
  silverCost: number;
}

// Raw shape as written by pipeline/generate_recipes.py (recipes.json).
export interface RawRecipeRow {
  item_id: string;
  name: string;
  tier: number;
  enchant: number;
  category: string;
  shop_category: string;
  shop_subcategory: string;
  output_amount: number;
  item_value: number;
  item_value_is_estimate: boolean;
  focus_cost: number;
  materials: RecipeMaterial[];
  // Optional: absent from recipes.json rows written before the silver-cost
  // fix (and from some minimal test fixtures) -- fromRawRecipeRow defaults
  // it to 0, so the type must allow the field to be missing.
  silver_cost?: number;
}

export function fromRawRecipeRow(raw: RawRecipeRow): Recipe {
  return {
    itemId: raw.item_id,
    name: raw.name,
    tier: raw.tier,
    enchant: raw.enchant,
    category: raw.category,
    shopCategory: raw.shop_category,
    shopSubCategory: raw.shop_subcategory,
    outputAmount: raw.output_amount,
    itemValue: raw.item_value,
    itemValueIsEstimate: raw.item_value_is_estimate,
    focusCost: raw.focus_cost,
    materials: raw.materials,
    silverCost: raw.silver_cost ?? 0,
  };
}
