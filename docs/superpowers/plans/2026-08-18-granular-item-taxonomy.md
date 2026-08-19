# Granular Item Taxonomy & Cascading Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Dashboard's flat "Kategorie" filter with cascading Material → Slot/Typ → Familie dropdowns that mirror Albion's real item taxonomy, and add the missing `farmableitem` (Farming/seeds) category to the catalog.

**Architecture:** All new logic is pure, client-side derivation (`app/src/data/itemTaxonomy.ts`) reading fields already present in `recipes.json` (`itemId`, `name`, `category`, `shopSubCategory`) — no new pipeline fields, no `recipes.json` schema change. `FilterSortControls.tsx` grows three cascading dropdowns wired through the existing shared `matchesStructuralFilters` predicate, so `App.tsx` and `Dashboard.tsx` stay in sync by construction. The only pipeline change is adding one more already-supported category (`farmableitem`) to the extraction loop.

**Tech Stack:** Same as Phase 1 — Python 3.11+/pytest for the pipeline, React/Vite/TypeScript/Vitest for the app. No new dependencies (the "search dropdown" is a native `<input list>` + `<datalist>`).

## Global Constraints

- All derivation functions in `itemTaxonomy.ts` must be pure and total: given any `Recipe`, they return `null`/the input unchanged rather than throwing when an axis doesn't apply.
- Family key (`deriveFamilyId`) must be stable across tiers and enchant levels of the same item line — verified against real game data: `T4_SHOES_LEATHER_SET2` and `T4_SHOES_LEATHER_SET2@1` both reduce to `SHOES_LEATHER_SET2`.
- No duplicated data: the refined-resource material substrings (`PLANKS`/`CLOTH`/`METALBAR`/`LEATHER`/`STONEBLOCK`) already exist in `app/src/data/city_specializations.json`'s `refiningByIdSubstring` — reuse via export, do not re-type the list.
- `matchesStructuralFilters` in `FilterSortControls.tsx` remains the single shared predicate used by both `App.tsx` (PriceRefreshBar's "filtered view" scoping) and `Dashboard.tsx` (row display) — every new filter dimension is added there once, not duplicated.
- Category filter values (`recipe.category` strings) do not change — only their displayed labels change to German player-facing text. Nothing that matches on the raw `category` string elsewhere in the codebase needs to change.
- Tier honorifics (fixed English words, verified against the live dump): T1 "Beginner's", T2 "Novice's", T3 "Journeyman's", T4 "Adept's", T5 "Expert's", T6 "Master's", T7 "Grandmaster's", T8 "Elder's".

---

## Task 1: Pipeline — extract the `farmableitem` category

**Files:**
- Modify: `pipeline/generate_recipes.py:27` (the `CRAFTABLE_CATEGORIES` list)
- Modify: `tests/test_pipeline.py` (add a farmableitem fixture + test)

**Interfaces:**
- Produces: `recipes.json` rows with `category: "farmableitem"` for craftable farming items (seeds), using the exact same row shape every other category already produces (no new fields).

- [ ] **Step 1: Write the failing test**

Append to `tests/test_pipeline.py` (after the existing `test_generate_extracts_transformationweapon_category` function):

```python
def test_generate_extracts_farmableitem_category():
    """farmableitem is a separate top-level category from the real dump
    (seeds craftable at a station -- distinct from the actual farming/
    growing mechanic, which this pipeline does not model). Confirmed
    against the live 2026-08-18 data: e.g. T1_FARM_CARROT_SEED, name
    "Carrot Seeds" (no tier honorific prefix, like most consumables),
    @shopsubcategory1="farm"."""
    from generate_recipes import generate

    seed_item = {
        "@uniquename": "T1_FARM_CARROT_SEED",
        "@tier": "1",
        "@shopcategory": "farming",
        "@shopsubcategory1": "farm",
        "craftingrequirements": {
            "@craftingfocus": "10",
            "craftresource": [{"@uniquename": "T1_CARROT", "@count": "1"}],
        },
    }
    items_data = {
        "simpleitem": [],
        "equipmentitem": [],
        "weapon": [],
        "consumableitem": [],
        "mount": [],
        "transformationweapon": [],
        "farmableitem": [seed_item],
    }
    localized_names = [{"UniqueName": "T1_FARM_CARROT_SEED", "LocalizedNames": {"EN-US": "Carrot Seeds"}}]

    rows, summary = generate(items_data, localized_names)
    assert summary["per_category"]["farmableitem"] == 1
    row = next(r for r in rows if r["item_id"] == "T1_FARM_CARROT_SEED")
    assert row["category"] == "farmableitem"
    assert row["shop_subcategory"] == "farm"
    assert row["name"] == "Carrot Seeds"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_pipeline.py::test_generate_extracts_farmableitem_category -v`
Expected: FAIL — `KeyError: 'farmableitem'` when computing `summary["per_category"]["farmableitem"]` (the category isn't in `CRAFTABLE_CATEGORIES` yet, so `generate()` never touches it, so the summary dict has no such key).

- [ ] **Step 3: Add the category**

In `pipeline/generate_recipes.py`, change:

```python
CRAFTABLE_CATEGORIES = ["simpleitem", "equipmentitem", "weapon", "consumableitem", "mount", "transformationweapon"]
```

to:

```python
# "farmableitem" is a separate top-level category from the real dump for
# Farming (seeds craftable at a station). This models seed-crafting-and-
# selling only, using the exact same craft_profit() formulas as every
# other category -- NOT the actual farming/growing yield mechanic, which
# needs different formulas entirely (a future feature, analogous to
# Gathering-Profit).
CRAFTABLE_CATEGORIES = [
    "simpleitem", "equipmentitem", "weapon", "consumableitem", "mount",
    "transformationweapon", "farmableitem",
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_pipeline.py::test_generate_extracts_farmableitem_category -v`
Expected: PASS

- [ ] **Step 5: Run the full pipeline test suite**

Run: `pytest -v`
Expected: PASS (all tests, one more than before)

- [ ] **Step 6: Commit**

```bash
git add pipeline/generate_recipes.py tests/test_pipeline.py
git commit -m "feat(pipeline): extract farmableitem (Farming/seeds) category

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Export the refined-material substring list for reuse

**Files:**
- Modify: `app/src/data/citySpecializations.ts`
- Modify: `app/src/data/__tests__/citySpecializations.test.ts`

**Interfaces:**
- Produces: `REFINED_MATERIAL_SUBSTRINGS: readonly string[]` — `["PLANKS", "CLOTH", "STONEBLOCK", "LEATHER", "METALBAR"]`, sourced from `city_specializations.json`'s existing `refiningByIdSubstring` keys (single source of truth, not re-typed). Consumed by Task 4's `deriveMaterial`.

- [ ] **Step 1: Write the failing test**

Append to `app/src/data/__tests__/citySpecializations.test.ts`:

```ts
import { REFINED_MATERIAL_SUBSTRINGS } from '../citySpecializations';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm run test -- citySpecializations`
Expected: FAIL — `REFINED_MATERIAL_SUBSTRINGS` is not exported yet.

- [ ] **Step 3: Export it**

In `app/src/data/citySpecializations.ts`, add after the `DATA` constant declaration:

```ts
/** The refined-resource ID substrings this module already matches against
 * for city specialization (PLANKS/CLOTH/STONEBLOCK/LEATHER/METALBAR) --
 * exported so the item-taxonomy module can reuse the same list for its
 * "Material" filter under Rohstoff-Veredelung instead of re-typing it. */
export const REFINED_MATERIAL_SUBSTRINGS: readonly string[] = Object.keys(DATA.refiningByIdSubstring);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm run test -- citySpecializations`
Expected: PASS (12 tests: 11 existing + 1 new)

- [ ] **Step 5: Commit**

```bash
git add app/src/data/citySpecializations.ts app/src/data/__tests__/citySpecializations.test.ts
git commit -m "feat(app/data): export refined-material substrings for reuse

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: `itemTaxonomy.ts` — family derivation

**Files:**
- Create: `app/src/data/itemTaxonomy.ts`
- Create: `app/src/data/__tests__/itemTaxonomy.test.ts`

**Interfaces:**
- Consumes: `Recipe` type from `./types` (Task 18, existing).
- Produces: `TIER_HONORIFICS: Record<number, string>`, `deriveFamilyId(recipe: Pick<Recipe, 'itemId'>): string`, `deriveFamilyName(recipe: Pick<Recipe, 'name' | 'tier'>): string`. Consumed by Task 6 (`FilterSortControls.tsx`).

- [ ] **Step 1: Write the failing tests**

`app/src/data/__tests__/itemTaxonomy.test.ts`:
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm run test -- itemTaxonomy`
Expected: FAIL — cannot find module `../itemTaxonomy`

- [ ] **Step 3: Write the implementation**

`app/src/data/itemTaxonomy.ts`:
```ts
// Pure, dependency-free derivation of Albion's real item taxonomy (material,
// slot/type, and specific item "family"/line, e.g. "Stalker Shoes") from
// fields already present on a Recipe. No new pipeline fields, no
// recipes.json schema change -- see
// docs/superpowers/specs/2026-08-18-granular-item-taxonomy-design.md.

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
export function deriveFamilyId(recipe: { itemId: string }): string {
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
export function deriveFamilyName(recipe: { name: string; tier: number }): string {
  const honorific = TIER_HONORIFICS[recipe.tier];
  if (honorific && recipe.name.startsWith(`${honorific} `)) {
    return recipe.name.slice(honorific.length + 1);
  }
  return recipe.name;
}
```

Note: `REFINED_MATERIAL_SUBSTRINGS` is imported here but not used until Task 4 — this is expected, Task 4 appends `deriveMaterial`/`deriveSlotOrType` to this same file. If your editor/linter flags an unused import after this step alone, that's expected and resolves in Task 4; don't remove the import.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npm run test -- itemTaxonomy`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/data/itemTaxonomy.ts app/src/data/__tests__/itemTaxonomy.test.ts
git commit -m "feat(app/data): item family derivation (deriveFamilyId/Name)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: `itemTaxonomy.ts` — material and slot/type derivation

**Files:**
- Modify: `app/src/data/itemTaxonomy.ts`
- Modify: `app/src/data/__tests__/itemTaxonomy.test.ts`

**Interfaces:**
- Consumes: `REFINED_MATERIAL_SUBSTRINGS` from `./citySpecializations` (Task 2, already imported in Task 3).
- Produces: `deriveMaterial(recipe: Pick<Recipe, 'category' | 'shopSubCategory' | 'itemId'>): string | null`, `deriveSlotOrType(recipe: Pick<Recipe, 'category' | 'shopSubCategory'>): string | null`. Consumed by Task 5/6 (`FilterSortControls.tsx`).

- [ ] **Step 1: Write the failing tests**

Append to `app/src/data/__tests__/itemTaxonomy.test.ts`:
```ts
import { deriveMaterial, deriveSlotOrType } from '../itemTaxonomy';

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm run test -- itemTaxonomy`
Expected: FAIL — cannot find `deriveMaterial`/`deriveSlotOrType`

- [ ] **Step 3: Write the implementation**

Append to `app/src/data/itemTaxonomy.ts`:
```ts
const ARMOR_MATERIAL_PREFIXES = ['plate', 'leather', 'cloth'] as const;

/**
 * Material axis: 'plate'|'leather'|'cloth' for armor (derived from
 * shopSubCategory's prefix), the matched refined-resource substring
 * ('PLANKS'|'CLOTH'|'METALBAR'|'LEATHER'|'STONEBLOCK') for refining, null
 * for every other category (weapons/mounts/consumables/farming have no
 * material axis).
 */
export function deriveMaterial(recipe: {
  category: string;
  shopSubCategory: string;
  itemId: string;
}): string | null {
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
export function deriveSlotOrType(recipe: { category: string; shopSubCategory: string }): string | null {
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npm run test -- itemTaxonomy`
Expected: PASS (16 tests: 7 from Task 3 + 9 new)

- [ ] **Step 5: Commit**

```bash
git add app/src/data/itemTaxonomy.ts app/src/data/__tests__/itemTaxonomy.test.ts
git commit -m "feat(app/data): item material/slot derivation (deriveMaterial/SlotOrType)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: `FilterSortControls.tsx` — extend Filters, matching predicate, category labels

**Files:**
- Modify: `app/src/components/FilterSortControls.tsx`
- Modify: `app/src/components/__tests__/FilterSortControls.test.tsx`

**Interfaces:**
- Consumes: `deriveMaterial`, `deriveSlotOrType`, `deriveFamilyId` from `../data/itemTaxonomy` (Tasks 3-4).
- Produces: `Filters` interface gains `material: string`, `slot: string`, `family: string` (all `DEFAULT_FILTERS`-initialized to `''`). `matchesStructuralFilters` checks all three. `CATEGORIES` includes `transformationweapon` and `farmableitem` (previously missing from the selectable list even though the pipeline has produced `transformationweapon` rows since the original Phase 1 plan). A new `CATEGORY_LABELS` map provides German display text. This task does NOT yet add the new dropdown UI controls (Task 6) — it only extends the data model and matching logic, keeping this task's diff reviewable on its own.

- [ ] **Step 1: Write the failing tests**

Append to `app/src/components/__tests__/FilterSortControls.test.tsx`:
```ts
import { matchesStructuralFilters, DEFAULT_FILTERS } from '../FilterSortControls';

describe('matchesStructuralFilters', () => {
  const clothRecipe = {
    category: 'simpleitem',
    tier: 4,
    enchant: 0,
    shopSubCategory: 'refinedresources',
    itemId: 'T4_CLOTH',
    name: 'Fine Cloth',
  };

  it('matches everything when no filters are set', () => {
    expect(matchesStructuralFilters(clothRecipe, DEFAULT_FILTERS)).toBe(true);
  });

  it('filters by material', () => {
    expect(matchesStructuralFilters(clothRecipe, { ...DEFAULT_FILTERS, material: 'CLOTH' })).toBe(true);
    expect(matchesStructuralFilters(clothRecipe, { ...DEFAULT_FILTERS, material: 'PLANKS' })).toBe(false);
  });

  it('filters by slot', () => {
    const shoes = { category: 'equipmentitem', tier: 6, enchant: 0, shopSubCategory: 'leather_shoes', itemId: 'T6_SHOES_LEATHER_MORGANA', name: "Master's Stalker Shoes" };
    expect(matchesStructuralFilters(shoes, { ...DEFAULT_FILTERS, slot: 'shoes' })).toBe(true);
    expect(matchesStructuralFilters(shoes, { ...DEFAULT_FILTERS, slot: 'helmet' })).toBe(false);
  });

  it('filters by family', () => {
    expect(matchesStructuralFilters(clothRecipe, { ...DEFAULT_FILTERS, family: 'CLOTH' })).toBe(true);
    expect(matchesStructuralFilters(clothRecipe, { ...DEFAULT_FILTERS, family: 'PLANKS' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm run test -- FilterSortControls`
Expected: FAIL — `Filters` has no `material`/`slot`/`family` keys yet (TypeScript error) and `matchesStructuralFilters` ignores them.

- [ ] **Step 3: Update the Filters type, DEFAULT_FILTERS, matchesStructuralFilters, and CATEGORIES**

In `app/src/components/FilterSortControls.tsx`, add the import and change these four pieces:

```ts
import { deriveMaterial, deriveSlotOrType, deriveFamilyId } from '../data/itemTaxonomy';
```

```ts
export interface Filters {
  category: string;
  tier: number | '';
  enchant: number | '';
  material: string;
  slot: string;
  family: string;
  onlyProfitable: boolean;
  sortKey: SortKey;
}

export const DEFAULT_FILTERS: Filters = {
  category: '',
  tier: '',
  enchant: '',
  material: '',
  slot: '',
  family: '',
  onlyProfitable: false,
  sortKey: 'profitPerUnit',
};

const CATEGORIES = ['simpleitem', 'equipmentitem', 'weapon', 'transformationweapon', 'consumableitem', 'mount', 'farmableitem'];

export const CATEGORY_LABELS: Record<string, string> = {
  simpleitem: 'Rohstoff-Veredelung',
  equipmentitem: 'Rüstung',
  weapon: 'Waffen',
  transformationweapon: 'Shapeshifter Staves',
  consumableitem: 'Verbrauchsgüter',
  mount: 'Mounts',
  farmableitem: 'Farming',
};
```

```ts
export function matchesStructuralFilters(
  recipe: { category: string; tier: number; enchant: number; shopSubCategory: string; itemId: string; name: string },
  filters: Filters
): boolean {
  if (filters.category && recipe.category !== filters.category) return false;
  if (filters.tier !== '' && recipe.tier !== filters.tier) return false;
  if (filters.enchant !== '' && recipe.enchant !== filters.enchant) return false;
  if (filters.material && deriveMaterial(recipe) !== filters.material) return false;
  if (filters.slot && deriveSlotOrType(recipe) !== filters.slot) return false;
  if (filters.family && deriveFamilyId(recipe) !== filters.family) return false;
  return true;
}
```

Also update the Kategorie `<select>`'s option rendering (inside the JSX further down the file) to use the new label map instead of the raw value:

```tsx
{CATEGORIES.map((c) => (
  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
))}
```

Finally, update the component's existing two tests (`calls onChange with the updated category`, `calls onChange with the updated sort key`) — they currently render `<FilterSortControls filters={...} onChange={...} />` with no `recipes` prop. Task 6 will make `recipes` a required prop; to keep this task's diff self-contained and not break the build on a not-yet-existing prop, do NOT add the prop requirement yet — that happens in Task 6. This task only changes `Filters`/`matchesStructuralFilters`/`CATEGORIES`, so the two existing render-based tests need no changes here (they don't touch `matchesStructuralFilters` and don't need the new fields to be set explicitly, since `DEFAULT_FILTERS` already includes them).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npm run test -- FilterSortControls`
Expected: PASS (6 tests: 2 existing + 4 new `matchesStructuralFilters` tests)

- [ ] **Step 5: Run the full app test suite to check for regressions**

Run: `cd app && npm run test`
Expected: PASS — `Dashboard.test.tsx` and `App.test.tsx` both call `matchesStructuralFilters`/render `FilterSortControls` and must be unaffected, since the three new `Filters` fields default to `''` (no filtering change for existing tests that never set them).

- [ ] **Step 6: Commit**

```bash
git add app/src/components/FilterSortControls.tsx app/src/components/__tests__/FilterSortControls.test.tsx
git commit -m "feat(app/components): extend Filters with material/slot/family, fix category list

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: `FilterSortControls.tsx` — cascading Material/Slot/Familie UI

**Files:**
- Modify: `app/src/components/FilterSortControls.tsx`
- Modify: `app/src/components/__tests__/FilterSortControls.test.tsx`
- Modify: `app/src/App.tsx` (pass the new required `recipes` prop — see Task 7, but the prop is added here since this task makes it required; Task 7 covers the rest of `App.tsx`'s integration)

**Interfaces:**
- Consumes: `Recipe` type from `../data/types`; `deriveMaterial`, `deriveSlotOrType`, `deriveFamilyId`, `deriveFamilyName` from `../data/itemTaxonomy`.
- Produces: `FilterSortControls` now requires a `recipes: Recipe[]` prop (the full, unfiltered catalog) to compute each dropdown's cascading options.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `app/src/components/__tests__/FilterSortControls.test.tsx` with (the two existing tests plus the four from Task 5 are preserved, `recipes` prop added to every render call, and new cascading-behavior tests appended):

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterSortControls, DEFAULT_FILTERS, matchesStructuralFilters } from '../FilterSortControls';
import type { Recipe } from '../../data/types';

function recipe(overrides: Partial<Recipe>): Recipe {
  return {
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
    materials: [],
    ...overrides,
  };
}

const RECIPES: Recipe[] = [
  recipe({ itemId: 'T4_CLOTH', name: 'Fine Cloth', category: 'simpleitem', shopSubCategory: 'refinedresources' }),
  recipe({ itemId: 'T4_PLANKS', name: 'Fine Planks', category: 'simpleitem', shopSubCategory: 'refinedresources' }),
  recipe({
    itemId: 'T6_SHOES_LEATHER_MORGANA',
    name: "Master's Stalker Shoes",
    tier: 6,
    category: 'equipmentitem',
    shopSubCategory: 'leather_shoes',
  }),
  recipe({
    itemId: 'T6_SHOES_LEATHER_SET1',
    name: "Master's Mercenary Shoes",
    tier: 6,
    category: 'equipmentitem',
    shopSubCategory: 'leather_shoes',
  }),
  recipe({
    itemId: 'T6_HEAD_PLATE_SET1',
    name: "Master's Soldier Helmet",
    tier: 6,
    category: 'equipmentitem',
    shopSubCategory: 'plate_helmet',
  }),
];

describe('FilterSortControls', () => {
  it('calls onChange with the updated category', () => {
    const onChange = vi.fn();
    render(<FilterSortControls filters={DEFAULT_FILTERS} onChange={onChange} recipes={RECIPES} />);
    fireEvent.change(screen.getByLabelText('Kategorie'), { target: { value: 'weapon' } });
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, category: 'weapon' });
  });

  it('calls onChange with the updated sort key', () => {
    const onChange = vi.fn();
    render(<FilterSortControls filters={DEFAULT_FILTERS} onChange={onChange} recipes={RECIPES} />);
    fireEvent.change(screen.getByLabelText('Sortieren nach'), { target: { value: 'silverPerFocus' } });
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, sortKey: 'silverPerFocus' });
  });

  it('shows a Material dropdown scoped to the selected category, with only the materials present there', () => {
    const onChange = vi.fn();
    const filters = { ...DEFAULT_FILTERS, category: 'equipmentitem' };
    render(<FilterSortControls filters={filters} onChange={onChange} recipes={RECIPES} />);
    const materialSelect = screen.getByLabelText('Material') as HTMLSelectElement;
    const optionValues = Array.from(materialSelect.options).map((o) => o.value);
    expect(optionValues).toEqual(['', 'leather', 'plate']);
  });

  it('does not show a Material dropdown for weapon (no material axis)', () => {
    const onChange = vi.fn();
    const filters = { ...DEFAULT_FILTERS, category: 'weapon' };
    render(<FilterSortControls filters={filters} onChange={onChange} recipes={RECIPES} />);
    expect(screen.queryByLabelText('Material')).toBeNull();
  });

  it('scopes the Slot dropdown to the selected Material', () => {
    const onChange = vi.fn();
    const filters = { ...DEFAULT_FILTERS, category: 'equipmentitem', material: 'leather' };
    render(<FilterSortControls filters={filters} onChange={onChange} recipes={RECIPES} />);
    const slotSelect = screen.getByLabelText('Slot') as HTMLSelectElement;
    const optionValues = Array.from(slotSelect.options).map((o) => o.value);
    expect(optionValues).toEqual(['', 'shoes']);
  });

  it('resets material/slot/family when category changes', () => {
    const onChange = vi.fn();
    const filters = { ...DEFAULT_FILTERS, category: 'equipmentitem', material: 'leather', slot: 'shoes', family: 'SHOES_LEATHER_SET1' };
    render(<FilterSortControls filters={filters} onChange={onChange} recipes={RECIPES} />);
    fireEvent.change(screen.getByLabelText('Kategorie'), { target: { value: 'weapon' } });
    expect(onChange).toHaveBeenCalledWith({ ...filters, category: 'weapon', material: '', slot: '', family: '' });
  });

  it('resets slot/family when material changes', () => {
    const onChange = vi.fn();
    const filters = { ...DEFAULT_FILTERS, category: 'equipmentitem', material: 'leather', slot: 'shoes', family: 'SHOES_LEATHER_SET1' };
    render(<FilterSortControls filters={filters} onChange={onChange} recipes={RECIPES} />);
    fireEvent.change(screen.getByLabelText('Material'), { target: { value: 'plate' } });
    expect(onChange).toHaveBeenCalledWith({ ...filters, material: 'plate', slot: '', family: '' });
  });

  it('offers a searchable Familie datalist scoped to category+material+slot, keyed by family id', () => {
    const onChange = vi.fn();
    const filters = { ...DEFAULT_FILTERS, category: 'equipmentitem', material: 'leather', slot: 'shoes' };
    render(<FilterSortControls filters={filters} onChange={onChange} recipes={RECIPES} />);
    fireEvent.change(screen.getByLabelText('Familie'), { target: { value: 'Stalker Shoes' } });
    expect(onChange).toHaveBeenCalledWith({ ...filters, family: 'SHOES_LEATHER_MORGANA' });
  });

  describe('matchesStructuralFilters', () => {
    const clothRecipe = {
      category: 'simpleitem',
      tier: 4,
      enchant: 0,
      shopSubCategory: 'refinedresources',
      itemId: 'T4_CLOTH',
      name: 'Fine Cloth',
    };

    it('matches everything when no filters are set', () => {
      expect(matchesStructuralFilters(clothRecipe, DEFAULT_FILTERS)).toBe(true);
    });

    it('filters by material', () => {
      expect(matchesStructuralFilters(clothRecipe, { ...DEFAULT_FILTERS, material: 'CLOTH' })).toBe(true);
      expect(matchesStructuralFilters(clothRecipe, { ...DEFAULT_FILTERS, material: 'PLANKS' })).toBe(false);
    });

    it('filters by slot', () => {
      const shoes = { category: 'equipmentitem', tier: 6, enchant: 0, shopSubCategory: 'leather_shoes', itemId: 'T6_SHOES_LEATHER_MORGANA', name: "Master's Stalker Shoes" };
      expect(matchesStructuralFilters(shoes, { ...DEFAULT_FILTERS, slot: 'shoes' })).toBe(true);
      expect(matchesStructuralFilters(shoes, { ...DEFAULT_FILTERS, slot: 'helmet' })).toBe(false);
    });

    it('filters by family', () => {
      expect(matchesStructuralFilters(clothRecipe, { ...DEFAULT_FILTERS, family: 'CLOTH' })).toBe(true);
      expect(matchesStructuralFilters(clothRecipe, { ...DEFAULT_FILTERS, family: 'PLANKS' })).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm run test -- FilterSortControls`
Expected: FAIL — `recipes` prop not accepted (TypeScript error) and no Material/Slot/Familie controls exist yet.

- [ ] **Step 3: Write the implementation**

Replace the component function (and its surrounding helpers) in `app/src/components/FilterSortControls.tsx` with:

```tsx
import type { Recipe } from '../data/types';

type TaxonomyRecipe = Pick<Recipe, 'category' | 'tier' | 'enchant' | 'shopSubCategory' | 'itemId' | 'name'>;

function recipesMatchingUpTo(recipes: TaxonomyRecipe[], filters: Filters, upTo: 'category' | 'material' | 'slot'): TaxonomyRecipe[] {
  return recipes.filter((r) => {
    if (filters.category && r.category !== filters.category) return false;
    if (upTo === 'category') return true;
    if (filters.material && deriveMaterial(r) !== filters.material) return false;
    if (upTo === 'material') return true;
    if (filters.slot && deriveSlotOrType(r) !== filters.slot) return false;
    return true;
  });
}

function distinctSorted(values: (string | null)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => v !== null))).sort();
}

export function FilterSortControls({
  filters,
  onChange,
  recipes,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
  recipes: Recipe[];
}) {
  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    let next: Filters = { ...filters, [key]: value };
    if (key === 'category') next = { ...next, material: '', slot: '', family: '' };
    if (key === 'material') next = { ...next, slot: '', family: '' };
    if (key === 'slot') next = { ...next, family: '' };
    onChange(next);
  }

  const materialCandidates = recipesMatchingUpTo(recipes, filters, 'category');
  const materialOptions = distinctSorted(materialCandidates.map(deriveMaterial));

  const slotCandidates = recipesMatchingUpTo(recipes, filters, 'material');
  const slotOptions = distinctSorted(slotCandidates.map(deriveSlotOrType));

  const familyCandidates = recipesMatchingUpTo(recipes, filters, 'slot');
  const familyMap = new Map<string, string>();
  for (const r of familyCandidates) {
    familyMap.set(deriveFamilyId(r), deriveFamilyName(r));
  }
  const familyOptions = Array.from(familyMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <section className="filter-sort-controls" aria-label="Filter & Sortierung">
      <label>
        Kategorie
        <select value={filters.category} onChange={(e) => update('category', e.target.value)}>
          <option value="">Alle</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
      </label>

      <label>
        Tier
        <select value={filters.tier} onChange={(e) => update('tier', e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">Alle</option>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((t) => (
            <option key={t} value={t}>T{t}</option>
          ))}
        </select>
      </label>

      <label>
        Enchant
        <select value={filters.enchant} onChange={(e) => update('enchant', e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">Alle</option>
          {[0, 1, 2, 3, 4].map((lvl) => (
            <option key={lvl} value={lvl}>.{lvl}</option>
          ))}
        </select>
      </label>

      {materialOptions.length > 0 && (
        <label>
          Material
          <select value={filters.material} onChange={(e) => update('material', e.target.value)}>
            <option value="">Alle</option>
            {materialOptions.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
      )}

      {slotOptions.length > 0 && (
        <label>
          {filters.category === 'equipmentitem' ? 'Slot' : 'Typ'}
          <select value={filters.slot} onChange={(e) => update('slot', e.target.value)}>
            <option value="">Alle</option>
            {slotOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      )}

      {familyOptions.length > 0 && (
        <label>
          Familie
          <input
            key={`${filters.category}|${filters.material}|${filters.slot}`}
            list="family-options"
            defaultValue={familyMap.get(filters.family) ?? ''}
            onChange={(e) => {
              const match = familyOptions.find(([, name]) => name === e.target.value);
              update('family', match ? match[0] : '');
            }}
          />
          <datalist id="family-options">
            {familyOptions.map(([id, name]) => (
              <option key={id} value={name} />
            ))}
          </datalist>
        </label>
      )}

      <label>
        <input type="checkbox" checked={filters.onlyProfitable} onChange={(e) => update('onlyProfitable', e.target.checked)} />
        Nur profitabel
      </label>

      <label>
        Sortieren nach
        <select value={filters.sortKey} onChange={(e) => update('sortKey', e.target.value as SortKey)}>
          <option value="profitPerUnit">Profit / Einheit</option>
          <option value="silverPerFocus">Silber / Fokus</option>
        </select>
      </label>
    </section>
  );
}
```

Note on the `Familie` input: it uses `defaultValue` (uncontrolled for the displayed text) rather than `value`, because the field displays a human name but stores a family *id* — a controlled `value={filters.family}` would show the raw id, not the name. `onChange` still fully drives filter state through the normal `update()` path, matching every other control's behavior.

The `key={...}` prop on that input is required, not decorative: React only applies `defaultValue` on the initial mount of an uncontrolled input — it does NOT re-apply on a later render, even if the prop's value changes. Without the `key`, changing Material/Slot (which correctly resets `family` to `''`) would leave the Familie input still showing its previous, now-stale, selected name, because the same DOM node stays mounted (the section is still rendered, just with a fresh `''` `family`). Keying on `category|material|slot` forces React to unmount and remount the input exactly when those upstream values change — i.e. exactly when `family` gets cleared — so `defaultValue` is freshly re-applied and the stale text can never linger.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npm run test -- FilterSortControls`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/components/FilterSortControls.tsx app/src/components/__tests__/FilterSortControls.test.tsx
git commit -m "feat(app/components): cascading Material/Slot/Familie dropdowns

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Wire the `recipes` prop through `App.tsx`

**Files:**
- Modify: `app/src/App.tsx`

**Interfaces:**
- Consumes: `FilterSortControls`'s new required `recipes` prop (Task 6).

- [ ] **Step 1: Update the render call**

In `app/src/App.tsx`, change:

```tsx
<FilterSortControls filters={filters} onChange={setFilters} />
```

to:

```tsx
<FilterSortControls filters={filters} onChange={setFilters} recipes={recipes} />
```

(`recipes` is already in scope — it's the `useState<Recipe[]>([])` declared earlier in `AppContent`.)

- [ ] **Step 2: Run the full app test suite**

Run: `cd app && npm run test`
Expected: PASS — `App.test.tsx` renders `<App />` with a mocked empty-array `fetch` response, so `recipes` is `[]` at render time; `FilterSortControls` must handle an empty `recipes` array without crashing (all the `.filter()`/`.map()` calls in Task 6's implementation are safe on `[]`, producing empty option lists and correctly hiding the Material/Slot/Familie sections via their `.length > 0` guards).

- [ ] **Step 3: Run tsc and build**

Run: `cd app && npx tsc -b --noEmit`
Expected: clean, no errors.

Run: `cd app && npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/src/App.tsx
git commit -m "feat(app): wire recipes into FilterSortControls for cascading options

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Real pipeline run, regenerate committed data, verify deploy

**Files:**
- Modify (generated): `app/public/data/recipes.json`
- Modify (generated): `app/public/data/recipes_core.json`

**Interfaces:** None (data regeneration only).

- [ ] **Step 1: Run the full test suite one more time (repo root + app)**

Run: `pytest -v` (from repo root)
Expected: PASS (all pipeline tests, including Task 1's new farmableitem test)

Run: `cd app && npm run test`
Expected: PASS (all app tests, including Tasks 3/4/5/6's new tests)

- [ ] **Step 2: Run the pipeline against the live game data**

```bash
cd pipeline
python generate_recipes.py --refresh
```

Expected output: a summary showing `farmableitem: N rows` (N > 0) alongside the existing categories, and a higher total row count than the previous run (8165 rows before this change — see `docs/superpowers/plans/2026-08-17-phase1-crafting-tool.md`'s Task 26 area for that baseline).

- [ ] **Step 3: Spot-check the new data**

```bash
python -c "
import json
with open('../app/public/data/recipes.json', encoding='utf-8') as f:
    rows = json.load(f)
farming = [r for r in rows if r['category'] == 'farmableitem']
print('farmableitem rows:', len(farming))
print('sample:', farming[0] if farming else None)
"
```

Expected: `farmableitem rows: <N>` with N > 0, and a sample row with `shop_subcategory` in `{"farm", "herbgarden", "kennel", "pasture"}`.

- [ ] **Step 4: Rebuild the app and smoke-test locally**

```bash
cd app
npm run build
npm run dev
```

Open the dev server URL, confirm:
- Kategorie dropdown shows "Farming" as an option, with friendly German labels for every category (not raw strings like `simpleitem`).
- Selecting Kategorie=Rüstung reveals a Material dropdown (Plate/Leather/Cloth) and, after picking one, a Slot dropdown, and after picking that, a searchable Familie field that filters as you type.
- Selecting Kategorie=Rohstoff-Veredelung reveals a Material dropdown with Planks/Cloth/Metal Bars/Leather/Stone Blocks-style values (no Slot dropdown for this category).
- Typing part of a known family name (e.g. "stalk") into Familie under Leather+Shoes surfaces "Stalker Shoes" as a suggestion.

Stop the dev server once confirmed (Ctrl+C).

- [ ] **Step 5: Commit the regenerated data**

```bash
git add app/public/data/recipes.json app/public/data/recipes_core.json
git commit -m "chore(data): regenerate recipes.json with farmableitem category

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Push and verify the live deploy**

```bash
git push origin master
```

Poll the deployed site until the new bundle is live (the deploy workflow runs the pipeline fresh on every push per `docs/SETUP.md`, so this push alone regenerates and republishes the data too — the commit in Step 5 is for local-dev convenience, matching the existing project convention of committing generated `recipes.json`):

```bash
for i in $(seq 1 20); do
  status=$(curl -s -o /dev/null -w "%{http_code}" https://mklemm1984-cpu.github.io/albion-crafting-tool/)
  if [ "$status" = "200" ]; then echo "site responding"; break; fi
  sleep 10
done
```

Confirm in a browser that the live site shows the new Kategorie labels and cascading Material/Slot/Familie dropdowns.
