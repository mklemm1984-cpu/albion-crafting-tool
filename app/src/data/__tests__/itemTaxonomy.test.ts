import { describe, it, expect } from 'vitest';
import { TIER_HONORIFICS, deriveFamilyId, deriveFamilyName } from '../itemTaxonomy';
import { deriveMaterial, deriveSlotOrType } from '../itemTaxonomy';

describe('TIER_HONORIFICS', () => {
  it('has all 8 tiers', () => {
    expect(TIER_HONORIFICS[1]).toBe("Beginner's");
    expect(TIER_HONORIFICS[4]).toBe("Adept's");
    expect(TIER_HONORIFICS[8]).toBe("Elder's");
  });
});

describe('deriveFamilyId', () => {
  it('strips the tier prefix, stable across tiers of the same line', () => {
    // Real example: T1_SHOES_LEATHER_SET1..T8_SHOES_LEATHER_SET1 are all
    // "Mercenary Shoes" at different tiers -- same family.
    expect(deriveFamilyId({ itemId: 'T4_SHOES_LEATHER_SET2' })).toBe('SHOES_LEATHER_SET2');
    expect(deriveFamilyId({ itemId: 'T8_SHOES_LEATHER_SET2' })).toBe('SHOES_LEATHER_SET2');
  });

  it('strips resource enchant suffixes (_LEVELk)', () => {
    expect(deriveFamilyId({ itemId: 'T4_CLOTH_LEVEL1' })).toBe('CLOTH');
  });

  it('strips equipment enchant suffixes (@k)', () => {
    expect(deriveFamilyId({ itemId: 'T4_SHOES_LEATHER_SET2@1' })).toBe('SHOES_LEATHER_SET2');
  });

  it('handles faction/artifact variant suffixes the same way as SET numbers', () => {
    // Real example: T4_SHOES_LEATHER_MORGANA = "Stalker Shoes".
    expect(deriveFamilyId({ itemId: 'T6_SHOES_LEATHER_MORGANA' })).toBe('SHOES_LEATHER_MORGANA');
  });
});

describe('deriveFamilyName', () => {
  it('strips the matching tier honorific prefix', () => {
    // Real example: T6_SHOES_LEATHER_MORGANA name is "Master's Stalker Shoes".
    expect(deriveFamilyName({ name: "Master's Stalker Shoes", tier: 6 })).toBe('Stalker Shoes');
  });

  it('returns the name unchanged when no honorific prefix matches', () => {
    // Real example: consumables/mounts often carry no tier honorific at all.
    expect(deriveFamilyName({ name: 'Grilled Fish', tier: 1 })).toBe('Grilled Fish');
    expect(deriveFamilyName({ name: 'Carrot Seeds', tier: 1 })).toBe('Carrot Seeds');
  });

  it('does not strip a different tier\'s honorific', () => {
    // "Master's Stalker Shoes" at tier 4 (mismatched) should NOT have
    // "Master's" stripped, since TIER_HONORIFICS[4] is "Adept's".
    expect(deriveFamilyName({ name: "Master's Stalker Shoes", tier: 4 })).toBe("Master's Stalker Shoes");
  });
});

describe('deriveMaterial', () => {
  it('derives plate/leather/cloth for equipment from shopSubCategory', () => {
    expect(deriveMaterial({ category: 'equipmentitem', shopSubCategory: 'leather_shoes', itemId: 'T6_SHOES_LEATHER_MORGANA' })).toBe('leather');
    expect(deriveMaterial({ category: 'equipmentitem', shopSubCategory: 'plate_helmet', itemId: 'T4_HEAD_PLATE_SET1' })).toBe('plate');
    expect(deriveMaterial({ category: 'equipmentitem', shopSubCategory: 'cloth_armor', itemId: 'T4_ARMOR_CLOTH_SET1' })).toBe('cloth');
  });

  it('returns null for equipment that has no plate/leather/cloth material (capes, bags, off-hands)', () => {
    expect(deriveMaterial({ category: 'equipmentitem', shopSubCategory: 'bags', itemId: 'T4_BAG' })).toBeNull();
    expect(deriveMaterial({ category: 'equipmentitem', shopSubCategory: 'accessoires_capes_lymhurst', itemId: 'T4_CAPE' })).toBeNull();
  });

  it('derives the refined-resource material for simpleitem via itemId substring', () => {
    expect(deriveMaterial({ category: 'simpleitem', shopSubCategory: 'refinedresources', itemId: 'T4_CLOTH' })).toBe('CLOTH');
    expect(deriveMaterial({ category: 'simpleitem', shopSubCategory: 'refinedresources', itemId: 'T4_METALBAR' })).toBe('METALBAR');
    expect(deriveMaterial({ category: 'simpleitem', shopSubCategory: 'refinedresources', itemId: 'T4_PLANKS' })).toBe('PLANKS');
  });

  it('returns null for categories with no material axis (weapons, mounts, consumables, farming)', () => {
    expect(deriveMaterial({ category: 'weapon', shopSubCategory: 'sword', itemId: 'T4_MAIN_SWORD' })).toBeNull();
    expect(deriveMaterial({ category: 'mount', shopSubCategory: 'basemounts', itemId: 'T3_MOUNT_HORSE' })).toBeNull();
    expect(deriveMaterial({ category: 'farmableitem', shopSubCategory: 'farm', itemId: 'T1_FARM_CARROT_SEED' })).toBeNull();
  });

  it('returns null for simpleitem artefacts whose itemId happens to contain a refined-material substring but whose shopSubCategory is not refinedresources', () => {
    // Regression for finding #3: T4_ARTEFACT_ARMOR_CLOTH_AVALON's itemId
    // contains "CLOTH" and used to be mis-bucketed as the refined material
    // CLOTH. Real shopSubCategory for these rows is "armors", confirmed
    // against app/public/data/recipes.json.
    expect(
      deriveMaterial({ category: 'simpleitem', shopSubCategory: 'armors', itemId: 'T4_ARTEFACT_ARMOR_CLOTH_AVALON' })
    ).toBeNull();
    expect(
      deriveMaterial({ category: 'simpleitem', shopSubCategory: 'armors', itemId: 'T4_ARTEFACT_ARMOR_LEATHER_AVALON' })
    ).toBeNull();
    // The genuine refined-resource case must still resolve correctly.
    expect(
      deriveMaterial({ category: 'simpleitem', shopSubCategory: 'refinedresources', itemId: 'T4_CLOTH' })
    ).toBe('CLOTH');
  });
});

describe('deriveSlotOrType', () => {
  it('derives the equipment slot by stripping the matched material prefix', () => {
    expect(deriveSlotOrType({ category: 'equipmentitem', shopSubCategory: 'leather_shoes' })).toBe('shoes');
    expect(deriveSlotOrType({ category: 'equipmentitem', shopSubCategory: 'plate_helmet' })).toBe('helmet');
    expect(deriveSlotOrType({ category: 'equipmentitem', shopSubCategory: 'cloth_armor' })).toBe('armor');
  });

  it('falls back to the raw shopSubCategory for equipment with no plate/leather/cloth material', () => {
    expect(deriveSlotOrType({ category: 'equipmentitem', shopSubCategory: 'bags' })).toBe('bags');
  });

  it('uses the raw shopSubCategory as the type for weapon/mount/consumable/farmableitem/transformationweapon', () => {
    expect(deriveSlotOrType({ category: 'weapon', shopSubCategory: 'sword' })).toBe('sword');
    expect(deriveSlotOrType({ category: 'mount', shopSubCategory: 'basemounts' })).toBe('basemounts');
    expect(deriveSlotOrType({ category: 'consumableitem', shopSubCategory: 'food' })).toBe('food');
    expect(deriveSlotOrType({ category: 'farmableitem', shopSubCategory: 'farm' })).toBe('farm');
    expect(deriveSlotOrType({ category: 'transformationweapon', shopSubCategory: 'shapeshifterstaff' })).toBe('shapeshifterstaff');
  });

  it('returns null for simpleitem (refining has no slot axis, only material)', () => {
    expect(deriveSlotOrType({ category: 'simpleitem', shopSubCategory: 'refinedresources' })).toBeNull();
  });
});
