import { describe, it, expect } from 'vitest';
import { TIER_HONORIFICS, deriveFamilyId, deriveFamilyName } from '../itemTaxonomy';

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
