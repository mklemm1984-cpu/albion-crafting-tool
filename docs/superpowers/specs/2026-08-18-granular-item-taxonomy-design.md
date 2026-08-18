# Granular Item Taxonomy & Cascading Filters — Design

Status: Approved by owner (Marcel), 2026-08-18.

## 0. Context

Phase 1 (see `docs/superpowers/specs/2026-08-17-albion-crafting-tool-design.md`) shipped a
flat "Kategorie" filter using the raw ao-bin-dumps top-level category names
(`simpleitem`, `equipmentitem`, `weapon`, `consumableitem`, `mount`,
`transformationweapon`). The owner wants the Dashboard's filtering to mirror how
Albion actually structures its item catalog: every item belongs to a specific,
named "line" (e.g. *Stalker Boots*, *Claymore*, *Minor Healing Potion*), grouped by
material/type, grouped by a broad category — the same drill-down structure
reference tools like albiononline2d.com/en/item use, just as dropdowns instead of a
sidebar tree (owner's explicit preference).

## 1. What the real game data gives us (verified against the live dump, 2026-08-18)

- **Family/line is already encoded in the item ID**, stable across tiers. Example:
  `T4_SHOES_LEATHER_SET2` → EN name "Adept's Hunter Shoes"; the same suffix
  (`SHOES_LEATHER_SET2`) appears at every tier (`T1`…`T8`) with only the tier
  number and the honorific prefix in the name changing. Faction/artifact variants
  use a named suffix instead of `SETn` (`_AVALON`, `_HELL`, `_MORGANA`, `_FEY`,
  `_ROYAL`, `_UNDEAD`, `_CRYSTAL`, …) — same mechanism, same stability.
- **Material + slot are already encoded in `@shopsubcategory1`** for equipment
  (`leather_shoes`, `cloth_helmet`, `plate_armor`, …) — verified all 9 combinations
  (`{plate,leather,cloth} × {helmet,armor,shoes}`) exist and are exhaustive for gear.
- **Weapon type is `@shopsubcategory1` directly** (`sword`, `axe`, `bow`, …) — no
  material split for weapons (correct, weapons aren't plate/leather/cloth).
- **Refined resources have NO per-resource `@shopsubcategory1`** — every refined
  resource (Planks/Cloth/Metal Bars/Leather/Stone Blocks) shares the single value
  `refinedresources`. This was already solved for the city-specialization feature
  (`app/src/data/city_specializations.json`'s `refiningByIdSubstring`) by matching
  the unique substring in the item ID (`PLANKS`/`CLOTH`/`METALBAR`/`LEATHER`/
  `STONEBLOCK`) — the taxonomy feature reuses the same substrings for its
  "Material" dropdown under Rohstoff-Veredelung.
- **`farmableitem` is a separate top-level category** from the ao-bin-dumps dump,
  currently NOT extracted by the pipeline at all. 49 of its 107 entries have
  `craftingrequirements` (seeds ARE craftable at a station, distinct from the
  actual farming/growing mechanic) with 4 meaningful `@shopsubcategory1` values:
  `farm` (crop seeds), `herbgarden` (herb seeds), `kennel`, `pasture` (animal
  farming). Owner confirmed: add this as crafting-and-sell only (same formulas as
  everything else) — NOT the farming/growing yield mechanic, which is a separate
  future feature with entirely different formulas (analogous to Gathering-Profit,
  already deferred to a later phase in the Phase 1 design doc).
- Tier honorifics are fixed, known English words: T1 "Beginner's", T2 "Novice's",
  T3 "Journeyman's", T4 "Adept's", T5 "Expert's", T6 "Master's", T7
  "Grandmaster's", T8 "Elder's". Many consumables/mounts don't carry an honorific
  at all (e.g. "Grilled Fish", "Minor Healing Potion") — stripping is a no-op in
  that case (the full name already IS the family name).

## 2. Scope decisions (confirmed with owner)

1. **`farmableitem` added to `CRAFTABLE_CATEGORIES`** (pipeline). Same
   craft-and-sell profit model as every other category — no new formulas, no new
   fields beyond what `extract_base_row`/`extract_enchant_rows_for_equipment`
   already produce. Requires one more real-data pipeline run and a
   `recipes.json`/`recipes_core.json` regeneration + redeploy.
2. **Material and Slot are separate, independently selectable filters** (not a
   combined "Leather Boots" bucket) — owner's explicit choice.
3. **Family is a searchable dropdown** (`<input list>` + `<datalist>`, native HTML,
   no new dependency) — type-to-filter, since a slot can have 5-10+ families.
4. **Everything is derived client-side** from fields already in `recipes.json`
   (`itemId`, `name`, `category`, `shopSubCategory`). No new pipeline fields, no
   `recipes.json` schema change (other than the farmableitem rows themselves).
5. **Cascading, not independent**: each dropdown's option list is computed from
   the recipes that already match every filter above it, so there are no dead-end
   selections (e.g. picking "Cloth" then seeing a "Boots" option that doesn't
   exist would be impossible — cloth boots don't exist in Albion).

## 3. New module: `app/src/data/itemTaxonomy.ts`

Pure, dependency-free derivation functions operating on a `Recipe`:

- `TIER_HONORIFICS: Record<number, string>` — the 8-entry lookup table above.
- `deriveFamilyId(recipe): string` — `itemId` with the leading `T{tier}_` stripped
  and any enchant suffix (`_LEVEL{k}` or `@{k}`) stripped. Stable across tiers and
  enchant levels of the same line (e.g. `T4_SHOES_LEATHER_SET2` and
  `T4_SHOES_LEATHER_SET2@1` both produce `SHOES_LEATHER_SET2`).
- `deriveFamilyName(recipe): string` — `name` with the matching tier honorific
  prefix removed (via `TIER_HONORIFICS[recipe.tier]`); returns `name` unchanged if
  no honorific prefix is present (consumables, mounts).
- `deriveMaterial(recipe): string | null` — for `category === 'equipmentitem'`:
  the `plate`/`leather`/`cloth` prefix of `shopSubCategory`. For
  `category === 'simpleitem'`: substring-matches `itemId` against
  `PLANKS`/`CLOTH`/`METALBAR`/`LEATHER`/`STONEBLOCK` (same substrings already used
  by `citySpecializations.ts`'s `refiningByIdSubstring` — this function reads that
  same table rather than duplicating the strings). `null` for every other category
  (weapons, mounts, consumables, farming don't have a material axis).
- `deriveSlotOrType(recipe): string | null` — for `category === 'equipmentitem'`:
  the slot suffix of `shopSubCategory` (`helmet`/`armor`/`shoes`). For every other
  category with a meaningful `shopSubCategory` (`weapon`, `transformationweapon`,
  `mount`, `consumableitem`, `farmableitem`): `shopSubCategory` itself (already the
  right granularity — `sword`, `basemounts`, `food`, `farm`, etc). `null` for
  `simpleitem` (refining has no slot axis, only material).
- All four functions are pure and total (no throwing) — a `Recipe` that doesn't
  fit a given axis returns `null`/the input unchanged, never crashes.

## 4. Filter model changes

`app/src/components/FilterSortControls.tsx`:

- `Filters` gains three fields: `material: string` (`''` = alle), `slot: string`
  (`''` = alle), `family: string` (`''` = alle). `DEFAULT_FILTERS` sets all three
  to `''`.
- `FilterSortControls` gains a new required prop: `recipes: Recipe[]` (the full,
  category/tier/enchant-filtered-so-far set is NOT what's passed — the component
  computes each dropdown's options by applying every filter *above* it in the
  cascade to the full recipe list, so `recipes` is the full unfiltered array and
  the component does its own progressive filtering internally for option
  computation only — actual row filtering for the Dashboard stays in
  `Dashboard.tsx` as today).
- Three new UI controls, rendered only when relevant options exist for the
  current category selection (e.g. no Material dropdown when Kategorie=Waffen):
  - **Material** (`<select>`): options = distinct `deriveMaterial()` values among
    recipes matching category+tier+enchant so far.
  - **Slot/Typ** (`<select>`): options = distinct `deriveSlotOrType()` values
    among recipes matching category+tier+enchant+material so far. Label switches
    between "Slot" and "Typ" based on category (armor vs everything else) for
    clarity — cosmetic only, same underlying field.
  - **Familie** (`<input list="family-options">` + `<datalist>`): options =
    distinct `{deriveFamilyId, deriveFamilyName}` pairs among recipes matching
    every filter above it. The input's value is matched against `family` by
    `deriveFamilyId` (stable key), but displays/accepts the human `deriveFamilyName`
    text — resolved via a small id↔name map built alongside the datalist options.
- Changing a higher-level filter (category/material/slot) resets every filter
  below it to `''` (prevents an invisible stale selection silently narrowing
  results after the option that produced it is gone).
- `matchesStructuralFilters` (existing, shared with `App.tsx`) extended with the
  three new checks, using the same `deriveMaterial`/`deriveSlotOrType`/
  `deriveFamilyId` functions — one shared predicate, no duplicated matching logic
  (same DRY principle the Phase 1 final review already established for this
  function).

## 5. Category labels

The existing "Kategorie" dropdown's option values stay the raw category strings
(`simpleitem`, `equipmentitem`, …, `farmableitem`) so nothing else in the codebase
that matches on `recipe.category` needs to change — only the *displayed* label
text changes to German, player-facing names:

| value | label |
|---|---|
| `simpleitem` | Rohstoff-Veredelung |
| `equipmentitem` | Rüstung |
| `weapon` | Waffen |
| `transformationweapon` | Shapeshifter Staves |
| `consumableitem` | Verbrauchsgüter |
| `mount` | Mounts |
| `farmableitem` | Farming |

## 6. Pipeline change

`pipeline/generate_recipes.py`: add `"farmableitem"` to `CRAFTABLE_CATEGORIES`.
One-line change, no new extraction logic needed (the existing category loop
already handles any category uniformly). Requires:
- A new pytest fixture/test confirming a `farmableitem` row extracts correctly
  (mirrors the existing `test_generate_extracts_transformationweapon_category`).
- A real pipeline run against the live dump, committing the regenerated
  `app/public/data/recipes.json`/`recipes_core.json`.

## 7. Testing

- `itemTaxonomy.ts`: unit tests for all 4 derivation functions against real
  examples from §1 (Stalker Shoes, Claymore, a refined-resource row, a
  farmableitem row, a consumable with no honorific).
- `FilterSortControls.tsx`: tests confirming cascading option computation (e.g.
  picking Material=Leather narrows Slot options to only slots that have leather
  items; picking a Slot resets any previously-selected Familie that's no longer
  valid).
- `Dashboard.tsx` / `App.tsx`: confirm `matchesStructuralFilters` correctly
  narrows the visible/priced rows when material/slot/family are set (extends the
  existing filter tests, no new integration surface).
- Pipeline: the farmableitem extraction test above, plus updated total-row-count
  assertions wherever the real pipeline run's summary is referenced in docs.

## 8. Out of scope

- Farming/growing yield profit calculation (separate future feature, different
  formulas — this design only adds seed-crafting-and-selling, identical to every
  other category).
- Gathering-Profit and Black-Market-Flipping (already deferred, unrelated to this
  change).
- Any change to the underlying `craft_profit()`/`craftProfit()` formulas — this is
  purely a filtering/UX feature layered on top of the existing, unchanged
  calculation engine.
