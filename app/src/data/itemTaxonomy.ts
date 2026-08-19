// Pure, dependency-free derivation of Albion's real item taxonomy (material,
// slot/type, and specific item "family"/line, e.g. "Stalker Shoes") from
// fields already present on a Recipe. No new pipeline fields, no
// recipes.json schema change -- see
// docs/superpowers/specs/2026-08-18-granular-item-taxonomy-design.md.

import type { Recipe } from './types';
import { REFINED_MATERIAL_SUBSTRINGS } from './citySpecializations';

/** Fixed, known English tier-honorific words (verified against the live
 * ao-bin-dumps data, 2026-08-18). Many consumables/mounts/farming items
 * carry no honorific at all -- that's handled by deriveFamilyName falling
 * through unchanged, not by this table. */
export const TIER_HONORIFICS: Record<number, string> = {
  1: "Beginner's",
  2: "Novice's",
  3: "Journeyman's",
  4: "Adept's",
  5: "Expert's",
  6: "Master's",
  7: "Grandmaster's",
  8: "Elder's",
};

const ENCHANT_LEVEL_SUFFIX_RE = /_LEVEL[1-4]$/;
const ENCHANT_AT_SUFFIX_RE = /@[1-4]$/;
const TIER_PREFIX_RE = /^T\d+_/;

/**
 * Stable key for the specific item line/family this recipe belongs to,
 * independent of tier and enchant level. Example: T4_SHOES_LEATHER_SET2
 * and T4_SHOES_LEATHER_SET2@1 both produce "SHOES_LEATHER_SET2".
 */
export function deriveFamilyId(recipe: Pick<Recipe, 'itemId'>): string {
  return recipe.itemId
    .replace(TIER_PREFIX_RE, '')
    .replace(ENCHANT_LEVEL_SUFFIX_RE, '')
    .replace(ENCHANT_AT_SUFFIX_RE, '');
}

/**
 * Human-readable family/line name: the recipe's own name with the matching
 * tier honorific prefix removed (e.g. "Master's Stalker Shoes" -> "Stalker
 * Shoes"). Returns the name unchanged if no honorific prefix is present
 * (most consumables, mounts, and farming items don't carry one).
 */
export function deriveFamilyName(recipe: Pick<Recipe, 'name' | 'tier'>): string {
  const honorific = TIER_HONORIFICS[recipe.tier];
  if (honorific && recipe.name.startsWith(`${honorific} `)) {
    return recipe.name.slice(honorific.length + 1);
  }
  return recipe.name;
}

const ARMOR_MATERIAL_PREFIXES = ['plate', 'leather', 'cloth'] as const;

/**
 * Material axis: 'plate'|'leather'|'cloth' for armor (derived from
 * shopSubCategory's prefix), the matched refined-resource substring
 * ('PLANKS'|'CLOTH'|'METALBAR'|'LEATHER'|'STONEBLOCK') for refining, null
 * for every other category (weapons/mounts/consumables/farming have no
 * material axis).
 */
export function deriveMaterial(recipe: Pick<Recipe, 'category' | 'shopSubCategory' | 'itemId'>): string | null {
  if (recipe.category === 'equipmentitem') {
    const prefix = ARMOR_MATERIAL_PREFIXES.find((m) => recipe.shopSubCategory.startsWith(`${m}_`));
    return prefix ?? null;
  }
  if (recipe.category === 'simpleitem') {
    const substring = REFINED_MATERIAL_SUBSTRINGS.find((s) => recipe.itemId.includes(s));
    return substring ?? null;
  }
  return null;
}

/**
 * Slot (armor: 'helmet'|'armor'|'shoes', by stripping the matched material
 * prefix off shopSubCategory) or type (everything else with a meaningful
 * shopSubCategory: the raw value, e.g. 'sword', 'basemounts', 'food',
 * 'farm'). Equipment with no plate/leather/cloth material (capes, bags,
 * off-hands) falls back to its own raw shopSubCategory as its "type".
 * Returns null for simpleitem (refining has no slot axis).
 */
export function deriveSlotOrType(recipe: Pick<Recipe, 'category' | 'shopSubCategory'>): string | null {
  if (recipe.category === 'simpleitem') return null;
  if (recipe.category === 'equipmentitem') {
    const material = ARMOR_MATERIAL_PREFIXES.find((m) => recipe.shopSubCategory.startsWith(`${m}_`));
    if (material) {
      return recipe.shopSubCategory.slice(material.length + 1) || null;
    }
    return recipe.shopSubCategory || null;
  }
  return recipe.shopSubCategory || null;
}
