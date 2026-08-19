import { describe, it, expect } from 'vitest';
import { craftingSpecCity, refiningSpecCity, REFINED_MATERIAL_SUBSTRINGS } from '../citySpecializations';

describe('craftingSpecCity', () => {
  it('matches weapon families by shopSubCategory', () => {
    expect(craftingSpecCity({ category: 'weapon', shopCategory: 'weapons', shopSubCategory: 'hammer' })).toBe('Fort Sterling');
    expect(craftingSpecCity({ category: 'weapon', shopCategory: 'weapons', shopSubCategory: 'bow' })).toBe('Lymhurst');
  });

  it('does not confuse bow with crossbow', () => {
    expect(craftingSpecCity({ category: 'weapon', shopCategory: 'weapons', shopSubCategory: 'crossbow' })).toBe('Bridgewatch');
  });

  it('matches gathering tools/gear via shopCategory', () => {
    expect(craftingSpecCity({ category: 'weapon', shopCategory: 'gathering', shopSubCategory: 'wood' })).toBe('Caerleon');
  });

  it('matches capes via shopSubCategory prefix', () => {
    expect(
      craftingSpecCity({
        category: 'equipmentitem',
        shopCategory: 'crafting',
        shopSubCategory: 'accessoires_capes_lymhurst',
      })
    ).toBe('Brecilien');
  });

  it('matches armor pieces by shopSubCategory', () => {
    expect(craftingSpecCity({ category: 'equipmentitem', shopCategory: 'crafting', shopSubCategory: 'cloth_armor' })).toBe('Fort Sterling');
    expect(craftingSpecCity({ category: 'equipmentitem', shopCategory: 'crafting', shopSubCategory: 'plate_shoes' })).toBe('Martlock');
  });

  it('matches shapeshifter staves via shopSubCategory', () => {
    expect(
      craftingSpecCity({ category: 'weapon', shopCategory: 'weapons', shopSubCategory: 'shapeshifterstaff' })
    ).toBe('Caerleon');
  });

  it('matches food and potions', () => {
    expect(craftingSpecCity({ category: 'consumableitem', shopCategory: 'consumables', shopSubCategory: 'food' })).toBe('Caerleon');
    expect(craftingSpecCity({ category: 'consumableitem', shopCategory: 'consumables', shopSubCategory: 'potions' })).toBe('Brecilien');
  });

  it('returns null for refining rows', () => {
    expect(craftingSpecCity({ category: 'simpleitem', shopCategory: 'crafting', shopSubCategory: 'refinedresources' })).toBeNull();
  });

  it('returns null when no specialization applies', () => {
    expect(craftingSpecCity({ category: 'mount', shopCategory: 'crafting', shopSubCategory: 'basemounts' })).toBeNull();
  });
});

describe('refiningSpecCity', () => {
  it('matches refined resources by item id substring', () => {
    expect(refiningSpecCity({ category: 'simpleitem', itemId: 'T4_CLOTH' })).toBe('Lymhurst');
    expect(refiningSpecCity({ category: 'simpleitem', itemId: 'T4_METALBAR' })).toBe('Thetford');
    expect(refiningSpecCity({ category: 'simpleitem', itemId: 'T4_PLANKS' })).toBe('Fort Sterling');
  });

  it('returns null for non-refining categories', () => {
    expect(refiningSpecCity({ category: 'weapon', itemId: 'T4_2H_BOW' })).toBeNull();
  });
});

describe('REFINED_MATERIAL_SUBSTRINGS', () => {
  it('exposes the same substrings used for refining city-spec matching', () => {
    expect(REFINED_MATERIAL_SUBSTRINGS).toContain('PLANKS');
    expect(REFINED_MATERIAL_SUBSTRINGS).toContain('CLOTH');
    expect(REFINED_MATERIAL_SUBSTRINGS).toContain('STONEBLOCK');
    expect(REFINED_MATERIAL_SUBSTRINGS).toContain('LEATHER');
    expect(REFINED_MATERIAL_SUBSTRINGS).toContain('METALBAR');
    expect(REFINED_MATERIAL_SUBSTRINGS).toHaveLength(5);
  });
});
