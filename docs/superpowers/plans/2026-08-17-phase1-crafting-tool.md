# Albion Crafting Tool — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 1 Albion Online crafting/refining/enchanting profit tool: a Python pipeline that generates the full item catalog from the official game data dump, and a client-side React/Vite/TypeScript web app that computes and displays crafting profitability using live market prices.

**Architecture:** Two independent, testable layers. (1) `pipeline/` — Python, run offline whenever the game patches, parses `ao-bin-dumps/items.json` into `app/public/data/recipes.json` (full catalog) and `recipes_core.json` (small test subset). (2) `app/` — a React/Vite/TypeScript static site with no backend; it fetches `recipes.json` at runtime and calls the Albion Online Data Project price API directly from the browser (CORS is open, verified). Calculation formulas are implemented twice (Python + TypeScript) with identical constants and identical acceptance tests, so both layers stay independently verifiable.

**Tech Stack:** Python 3.11+ (`requests`, `pytest`), Node 20+ / React 18 / Vite 5 / TypeScript 5 (`vitest`, `@testing-library/react`).

## Global Constraints

- All formulas MUST match `docs/MECHANICS_SOURCE.md` §2.1–§2.6 exactly (RRR, station fee, material cost, net revenue, profit, silver/focus) — these are copied verbatim from the owner's master prompt and are non-negotiable.
- Margin % is defined as `profit_per_unit / cost_per_unit` (confirmed by reverse-engineering the two worked examples in `docs/MECHANICS_SOURCE.md` §8 — 247.55/313.45 = 79.0%, 1006.40/2733.60 = 36.8%).
- Non-returnable materials (RRR does not apply): item ID contains any of `ARTEFACT`, `_RUNE`, `_SOUL`, `_RELIC`, `TOKEN`.
- Station fee is 0 for tier ≤ 2, otherwise `itemValue × 0.1125 × (feePer100Nutrition / 100)`.
- No backend/server component — the AODP API has `access-control-allow-origin: *` (verified 2026-08-17), so all price fetching happens directly from the browser.
- Recipe JSON field names are `snake_case` (Python-native, written by the pipeline); the app maps them to `camelCase` typed objects on load — never consume raw snake_case fields inside components.
- City-specialization matching uses the real `@shopcategory` / `@shopsubcategory1` fields from `ao-bin-dumps/items.json` for weapons/equipment/consumables/gathering-gear, and item-ID substring matching only for refined resources (where `@shopsubcategory1` is always `"refinedresources"` and does not distinguish resource type). This was verified against the live data dump on 2026-08-17 and is more reliable than ID-substring guessing (e.g. avoids confusing `bow` with `crossbow`).
- All data files the app needs at runtime or build time live under `app/`: generated recipes at `app/public/data/*.json` (fetched at runtime), hand-maintained `city_specializations.json` at `app/src/data/city_specializations.json` (bundled at build time).
- Every pure function (calc layer) must have unit tests before any UI/integration code consumes it (TDD).

---

## Task 1: Project scaffolding

**Files:**
- Create: `pipeline/requirements.txt`
- Create: `pytest.ini`
- Create: `tests/conftest.py`
- Create: `.gitignore`
- Create: `app/public/data/.gitkeep`

**Interfaces:**
- Produces: a `tests/` directory that can import any module under `pipeline/` directly (e.g. `from calc_reference import ...`).

- [ ] **Step 1: Create the pipeline dependency file**

`pipeline/requirements.txt`:
```
requests>=2.31
pytest>=8.0
```

- [ ] **Step 2: Create the pytest config and conftest**

`pytest.ini`:
```ini
[pytest]
testpaths = tests
```

`tests/conftest.py`:
```python
import pathlib
import sys

# Allow tests to import pipeline modules directly, e.g. `from calc_reference import ...`,
# regardless of which directory pytest is invoked from.
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "pipeline"))
```

- [ ] **Step 3: Create .gitignore**

`.gitignore`:
```
# Python
pipeline/.cache/
__pycache__/
*.pyc
.pytest_cache/

# Node
app/node_modules/
app/dist/

# OS
.DS_Store
```

- [ ] **Step 4: Create the app data placeholder directory**

`app/public/data/.gitkeep`: empty file (ensures the directory exists in git before the pipeline or Vite scaffold populate it).

- [ ] **Step 5: Verify structure**

Run: `ls pipeline tests app/public/data`
Expected: shows `requirements.txt` in `pipeline/`, `conftest.py` in `tests/`, `.gitkeep` in `app/public/data/`.

- [ ] **Step 6: Commit**

```bash
git add pipeline/requirements.txt pytest.ini tests/conftest.py .gitignore app/public/data/.gitkeep
git commit -m "chore: project scaffolding for pipeline and tests

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: calc_reference.py — resource_return_rate()

**Files:**
- Create: `pipeline/calc_reference.py`
- Test: `tests/test_calc.py`

**Interfaces:**
- Produces: `resource_return_rate(*, base_city_bonus, spec_bonus=0.0, daily_bonus=0.0, hideout_bonus=0.0, use_focus=False) -> float`, `is_non_returnable(item_id: str) -> bool`.

- [ ] **Step 1: Write the failing tests**

`tests/test_calc.py`:
```python
import pytest

from calc_reference import resource_return_rate, is_non_returnable


def test_resource_return_rate_base_city():
    assert resource_return_rate(base_city_bonus=0.18) == pytest.approx(0.1525, abs=1e-4)


def test_resource_return_rate_with_focus():
    rrr = resource_return_rate(base_city_bonus=0.18, use_focus=True)
    assert round(rrr, 4) == 0.4350


def test_resource_return_rate_with_hideout_bonus():
    rrr = resource_return_rate(
        base_city_bonus=0.18, spec_bonus=0.15, hideout_bonus=0.10, use_focus=True
    )
    assert round(rrr, 4) == 0.5050


def test_is_non_returnable():
    assert is_non_returnable("T5_ARTEFACT_FOCUS_AVALON")
    assert is_non_returnable("T4_RUNE")
    assert is_non_returnable("T4_SOUL")
    assert is_non_returnable("T4_RELIC")
    assert is_non_returnable("T4_FACTION_TOKEN_MARTLOCK")
    assert not is_non_returnable("T4_CLOTH")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_calc.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'calc_reference'`

- [ ] **Step 3: Write the implementation**

`pipeline/calc_reference.py`:
```python
"""Pure calculation functions for Albion Online crafting profit.

Formulas mirror docs/MECHANICS_SOURCE.md sections 2.1-2.6. Every function
here is deterministic and takes fully-resolved inputs (bonus values, prices)
so it can be unit tested without hitting any API.
"""

from __future__ import annotations

# Item ID substrings that are NOT returned by the Resource Return Rate.
NON_RETURNABLE_SUBSTRINGS = ("ARTEFACT", "_RUNE", "_SOUL", "_RELIC", "TOKEN")

FOCUS_BONUS = 0.59


def is_non_returnable(item_id: str) -> bool:
    """Artifacts, runes, souls, relics and faction tokens are charged at
    full price regardless of Resource Return Rate."""
    return any(s in item_id for s in NON_RETURNABLE_SUBSTRINGS)


def resource_return_rate(
    *,
    base_city_bonus: float,
    spec_bonus: float = 0.0,
    daily_bonus: float = 0.0,
    hideout_bonus: float = 0.0,
    use_focus: bool = False,
) -> float:
    """Resource Return Rate (RRR) from an additive production bonus stack.

    bonus = base_city_bonus + spec_bonus + daily_bonus + hideout_bonus
            + (0.59 if use_focus else 0)
    RRR   = bonus / (1 + bonus)
    """
    bonus = base_city_bonus + spec_bonus + daily_bonus + hideout_bonus
    if use_focus:
        bonus += FOCUS_BONUS
    return bonus / (1 + bonus)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_calc.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add pipeline/calc_reference.py tests/test_calc.py
git commit -m "feat(calc): resource return rate formula

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: calc_reference.py — station_fee()

**Files:**
- Modify: `pipeline/calc_reference.py`
- Modify: `tests/test_calc.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `station_fee(item_value: float, fee_per_100_nutrition: float, tier: int) -> float`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_calc.py`:
```python
from calc_reference import station_fee


def test_station_fee_t4_cloth():
    assert station_fee(item_value=16, fee_per_100_nutrition=150, tier=4) == pytest.approx(2.70, abs=1e-2)


def test_station_fee_zero_for_t1_t2():
    assert station_fee(item_value=999, fee_per_100_nutrition=150, tier=1) == 0
    assert station_fee(item_value=999, fee_per_100_nutrition=150, tier=2) == 0
```

(Combine the two `from calc_reference import ...` lines at the top of the file into one import statement.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_calc.py -v`
Expected: FAIL with `ImportError: cannot import name 'station_fee'`

- [ ] **Step 3: Write the implementation**

Append to `pipeline/calc_reference.py`:
```python
def station_fee(item_value: float, fee_per_100_nutrition: float, tier: int) -> float:
    """Crafting station usage fee for one craft action. No fee for T1/T2."""
    if tier <= 2:
        return 0.0
    nutrition = item_value * 0.1125
    return nutrition * (fee_per_100_nutrition / 100)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_calc.py -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add pipeline/calc_reference.py tests/test_calc.py
git commit -m "feat(calc): station usage fee formula

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: calc_reference.py — material_cost()

**Files:**
- Modify: `pipeline/calc_reference.py`
- Modify: `tests/test_calc.py`

**Interfaces:**
- Consumes: `is_non_returnable()` from Task 2.
- Produces: `material_cost(materials: list[dict], rrr: float) -> float` where each material dict is `{"id": str, "count": float, "price": float}`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_calc.py`:
```python
from calc_reference import material_cost


def test_material_cost_applies_rrr():
    materials = [
        {"id": "T4_FIBER", "count": 2, "price": 200},
        {"id": "T3_CLOTH", "count": 1, "price": 150},
    ]
    cost = material_cost(materials, rrr=0.4350)
    assert cost == pytest.approx(310.75, abs=1e-2)


def test_material_cost_full_price_for_non_returnable():
    materials = [{"id": "T4_FACTION_TOKEN_MARTLOCK", "count": 3, "price": 100}]
    cost = material_cost(materials, rrr=0.9)
    assert cost == 300
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_calc.py -v`
Expected: FAIL with `ImportError: cannot import name 'material_cost'`

- [ ] **Step 3: Write the implementation**

Append to `pipeline/calc_reference.py`:
```python
def material_cost(materials: list[dict], rrr: float) -> float:
    """Total material cost for one craft action (whole batch), after RRR.

    materials: list of {"id": str, "count": float, "price": float}
    Artifacts/runes/souls/relics/tokens are excluded from the RRR refund.
    """
    total = 0.0
    for mat in materials:
        raw_cost = mat["price"] * mat["count"]
        if is_non_returnable(mat["id"]):
            total += raw_cost
        else:
            total += raw_cost * (1 - rrr)
    return total
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_calc.py -v`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add pipeline/calc_reference.py tests/test_calc.py
git commit -m "feat(calc): material cost formula with non-returnable exception

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: calc_reference.py — net_revenue_per_unit, profit, silver_per_focus

**Files:**
- Modify: `pipeline/calc_reference.py`
- Modify: `tests/test_calc.py`

**Interfaces:**
- Produces: `net_revenue_per_unit(sell_price, sales_tax, setup_fee) -> float`, `profit(cost_per_unit, net_revenue) -> float`, `silver_per_focus(profit_per_batch, base_focus_cost) -> float | None`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_calc.py`:
```python
from calc_reference import net_revenue_per_unit, profit, silver_per_focus


def test_net_revenue_per_unit():
    assert net_revenue_per_unit(600, sales_tax=0.04, setup_fee=0.025) == pytest.approx(561.0, abs=1e-2)


def test_profit():
    assert profit(cost_per_unit=313.45, net_revenue=561.0) == pytest.approx(247.55, abs=1e-2)


def test_silver_per_focus():
    assert silver_per_focus(247.55, 54) == pytest.approx(4.584, abs=1e-3)


def test_silver_per_focus_zero_focus_cost_returns_none():
    assert silver_per_focus(100.0, 0) is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_calc.py -v`
Expected: FAIL with `ImportError: cannot import name 'net_revenue_per_unit'`

- [ ] **Step 3: Write the implementation**

Append to `pipeline/calc_reference.py`:
```python
def net_revenue_per_unit(sell_price: float, sales_tax: float, setup_fee: float) -> float:
    return sell_price * (1 - sales_tax - setup_fee)


def profit(cost_per_unit: float, net_revenue: float) -> float:
    return net_revenue - cost_per_unit


def silver_per_focus(profit_per_batch: float, base_focus_cost: float) -> float | None:
    if not base_focus_cost:
        return None
    return profit_per_batch / base_focus_cost
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_calc.py -v`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add pipeline/calc_reference.py tests/test_calc.py
git commit -m "feat(calc): net revenue, profit and silver-per-focus formulas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: calc_reference.py — craft_profit() integration + acceptance tests

**Files:**
- Modify: `pipeline/calc_reference.py`
- Modify: `tests/test_calc.py`

**Interfaces:**
- Consumes: `material_cost`, `station_fee`, `net_revenue_per_unit`, `profit`, `silver_per_focus` from Tasks 3-5.
- Produces: `craft_profit(*, materials, output_amount, item_value, focus_cost, tier, sell_price, rrr, fee_per_100_nutrition, sales_tax, setup_fee) -> dict` with keys `material_cost, fee, cost_per_unit, net_revenue, profit_per_unit, margin_pct, profit_per_batch, silver_per_focus, no_price_data`. This is the function later mirrored as TypeScript `craftProfit()` in Task 17 and consumed by the Dashboard component in Task 26 — keep the key names exactly as listed.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_calc.py`:
```python
from calc_reference import craft_profit

# Rounded to 4 dp to match how docs/MECHANICS_SOURCE.md §8 computed its
# shared worked-example config ("RRR = 0.77/1.77 = 0.4350 (4 dp)"). The raw
# unrounded division (0.43502824...) is off by more than the abs=1e-2
# tolerance below once multiplied through a materials sum of a few hundred
# silver — resource_return_rate() itself still returns full precision for
# production use; this rounding is specific to reproducing the master
# prompt's manually-computed acceptance numbers.
SHARED_RRR = round(resource_return_rate(base_city_bonus=0.18, use_focus=True), 4)


def test_craft_profit_refining_t4_cloth():
    result = craft_profit(
        materials=[
            {"id": "T4_FIBER", "count": 2, "price": 200},
            {"id": "T3_CLOTH", "count": 1, "price": 150},
        ],
        output_amount=1,
        item_value=16,
        focus_cost=54,
        tier=4,
        sell_price=600,
        rrr=SHARED_RRR,
        fee_per_100_nutrition=150,
        sales_tax=0.04,
        setup_fee=0.025,
    )
    assert result["no_price_data"] is False
    assert result["material_cost"] == pytest.approx(310.75, abs=1e-2)
    assert result["fee"] == pytest.approx(2.70, abs=1e-2)
    assert result["cost_per_unit"] == pytest.approx(313.45, abs=1e-2)
    assert result["net_revenue"] == pytest.approx(561.00, abs=1e-2)
    assert result["profit_per_unit"] == pytest.approx(247.55, abs=1e-2)
    assert result["margin_pct"] == pytest.approx(0.790, abs=1e-3)
    assert result["silver_per_focus"] == pytest.approx(4.584, abs=1e-3)


def test_craft_profit_gear_t4_head_cloth_set1():
    result = craft_profit(
        materials=[{"id": "T4_CLOTH", "count": 8, "price": 600}],
        output_amount=1,
        item_value=128,
        focus_cost=429,
        tier=4,
        sell_price=4000,
        rrr=SHARED_RRR,
        fee_per_100_nutrition=150,
        sales_tax=0.04,
        setup_fee=0.025,
    )
    assert result["cost_per_unit"] == pytest.approx(2733.60, abs=1e-2)
    assert result["net_revenue"] == pytest.approx(3740.00, abs=1e-2)
    assert result["profit_per_unit"] == pytest.approx(1006.40, abs=1e-2)
    assert result["margin_pct"] == pytest.approx(0.368, abs=1e-3)
    assert result["silver_per_focus"] == pytest.approx(2.346, abs=1e-3)


def test_craft_profit_no_price_data_missing_output_price():
    result = craft_profit(
        materials=[{"id": "T4_CLOTH", "count": 8, "price": 600}],
        output_amount=1,
        item_value=128,
        focus_cost=429,
        tier=4,
        sell_price=0,
        rrr=SHARED_RRR,
        fee_per_100_nutrition=150,
        sales_tax=0.04,
        setup_fee=0.025,
    )
    assert result["no_price_data"] is True
    assert result["profit_per_unit"] is None


def test_craft_profit_no_price_data_missing_material_price():
    result = craft_profit(
        materials=[{"id": "T4_CLOTH", "count": 8, "price": None}],
        output_amount=1,
        item_value=128,
        focus_cost=429,
        tier=4,
        sell_price=4000,
        rrr=SHARED_RRR,
        fee_per_100_nutrition=150,
        sales_tax=0.04,
        setup_fee=0.025,
    )
    assert result["no_price_data"] is True


def test_craft_profit_t1_t2_zero_fee():
    result = craft_profit(
        materials=[{"id": "T2_ORE", "count": 2, "price": 10}],
        output_amount=1,
        item_value=4,
        focus_cost=5,
        tier=2,
        sell_price=20,
        rrr=SHARED_RRR,
        fee_per_100_nutrition=150,
        sales_tax=0.04,
        setup_fee=0.025,
    )
    assert result["fee"] == 0


def test_craft_profit_batch_potion():
    result = craft_profit(
        materials=[{"id": "T4_TESTHERB", "count": 10, "price": 20}],
        output_amount=5,
        item_value=50,
        focus_cost=100,
        tier=4,
        sell_price=100,
        rrr=SHARED_RRR,
        fee_per_100_nutrition=150,
        sales_tax=0.04,
        setup_fee=0.025,
    )
    assert result["cost_per_unit"] == pytest.approx(24.2875, abs=1e-3)
    assert result["profit_per_batch"] == pytest.approx(346.06, abs=1e-1)
    assert result["silver_per_focus"] == pytest.approx(3.4606, abs=1e-3)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_calc.py -v`
Expected: FAIL with `ImportError: cannot import name 'craft_profit'`

- [ ] **Step 3: Write the implementation**

Append to `pipeline/calc_reference.py`:
```python
def craft_profit(
    *,
    materials: list[dict],
    output_amount: int,
    item_value: float,
    focus_cost: float,
    tier: int,
    sell_price: float | None,
    rrr: float,
    fee_per_100_nutrition: float,
    sales_tax: float,
    setup_fee: float,
) -> dict:
    """Full profit calculation for one recipe under a resolved config.

    Returns a dict with keys: material_cost, fee, cost_per_unit, net_revenue,
    profit_per_unit, margin_pct, profit_per_batch, silver_per_focus,
    no_price_data (bool).
    """
    missing_material_price = any(m["price"] in (None, 0) for m in materials)
    if missing_material_price or sell_price in (None, 0):
        return {
            "material_cost": None,
            "fee": None,
            "cost_per_unit": None,
            "net_revenue": None,
            "profit_per_unit": None,
            "margin_pct": None,
            "profit_per_batch": None,
            "silver_per_focus": None,
            "no_price_data": True,
        }

    mat_cost = material_cost(materials, rrr)
    fee = station_fee(item_value, fee_per_100_nutrition, tier)
    total_cost = mat_cost + fee
    cost_per_unit = total_cost / output_amount
    net_revenue = net_revenue_per_unit(sell_price, sales_tax, setup_fee)
    profit_per_unit = profit(cost_per_unit, net_revenue)
    profit_per_batch = profit_per_unit * output_amount
    margin_pct = (profit_per_unit / cost_per_unit) if cost_per_unit else None
    spf = silver_per_focus(profit_per_batch, focus_cost)

    return {
        "material_cost": mat_cost,
        "fee": fee,
        "cost_per_unit": cost_per_unit,
        "net_revenue": net_revenue,
        "profit_per_unit": profit_per_unit,
        "margin_pct": margin_pct,
        "profit_per_batch": profit_per_batch,
        "silver_per_focus": spf,
        "no_price_data": False,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_calc.py -v`
Expected: PASS (18 tests)

- [ ] **Step 5: Commit**

```bash
git add pipeline/calc_reference.py tests/test_calc.py
git commit -m "feat(calc): craft_profit integration with master-prompt acceptance tests

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: pipeline/download.py — cached downloads of the game data dump

**Files:**
- Create: `pipeline/download.py`
- Create: `tests/test_download.py`

**Interfaces:**
- Produces: `load_items(refresh: bool = False, cache_dir: pathlib.Path = CACHE_DIR) -> dict` (returns the `items` sub-object, keyed by category e.g. `simpleitem`), `load_localized_names(refresh: bool = False, cache_dir: pathlib.Path = CACHE_DIR) -> list`.

- [ ] **Step 1: Write the failing tests**

`tests/test_download.py`:
```python
import json
from unittest.mock import patch, MagicMock

from download import load_items, load_localized_names


def _make_response(payload):
    payload_bytes = json.dumps(payload).encode("utf-8")
    mock = MagicMock()
    mock.content = payload_bytes
    mock.json.return_value = payload
    mock.raise_for_status.return_value = None
    return mock


def test_load_items_downloads_and_caches(tmp_path):
    with patch("download.requests.get", return_value=_make_response({"items": {"simpleitem": []}})) as mock_get:
        result = load_items(refresh=True, cache_dir=tmp_path)
        assert result == {"simpleitem": []}
        assert mock_get.call_count == 1

        # second call without refresh reads from cache, no second network call
        result2 = load_items(refresh=False, cache_dir=tmp_path)
        assert result2 == {"simpleitem": []}
        assert mock_get.call_count == 1


def test_load_localized_names_returns_list(tmp_path):
    payload = [{"UniqueName": "T4_CLOTH", "LocalizedNames": {"EN-US": "Fine Cloth"}}]
    with patch("download.requests.get", return_value=_make_response(payload)):
        result = load_localized_names(refresh=True, cache_dir=tmp_path)
        assert result[0]["UniqueName"] == "T4_CLOTH"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_download.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'download'`

- [ ] **Step 3: Write the implementation**

`pipeline/download.py`:
```python
"""Downloads and locally caches the two large ao-bin-dumps JSON files the
recipe pipeline depends on. Both are big (items.json ~17MB, formatted/
items.json ~23MB) so they are only re-downloaded when refresh=True."""

from __future__ import annotations

import json
import pathlib
import sys

import requests

CACHE_DIR = pathlib.Path(__file__).parent / ".cache"
ITEMS_URL = "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/items.json"
NAMES_URL = "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/formatted/items.json"


def _cached_or_download(url: str, cache_name: str, refresh: bool, cache_dir: pathlib.Path):
    cache_dir.mkdir(exist_ok=True, parents=True)
    cache_path = cache_dir / cache_name
    if cache_path.exists() and not refresh:
        return json.loads(cache_path.read_text(encoding="utf-8"))

    response = requests.get(url, timeout=60)
    response.raise_for_status()
    cache_path.write_bytes(response.content)
    return response.json()


def load_items(refresh: bool = False, cache_dir: pathlib.Path = CACHE_DIR) -> dict:
    """Returns the parsed items.json 'items' object, keyed by category
    (simpleitem, equipmentitem, weapon, consumableitem, mount, ...)."""
    return _cached_or_download(ITEMS_URL, "items.json", refresh, cache_dir)["items"]


def load_localized_names(refresh: bool = False, cache_dir: pathlib.Path = CACHE_DIR) -> list:
    """Returns the parsed formatted/items.json list of
    {UniqueName, LocalizedNames} entries."""
    return _cached_or_download(NAMES_URL, "names.json", refresh, cache_dir)


if __name__ == "__main__":
    refresh = "--refresh" in sys.argv
    items = load_items(refresh)
    names = load_localized_names(refresh)
    print(f"Cached {len(items)} item categories and {len(names)} localized names in {CACHE_DIR}")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_download.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add pipeline/download.py tests/test_download.py
git commit -m "feat(pipeline): cached downloader for ao-bin-dumps item data

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: pipeline/recipe_extract.py — normalize_to_list() + select_standard_variant()

**Files:**
- Create: `pipeline/recipe_extract.py`
- Create: `tests/test_recipe_extract.py`

**Interfaces:**
- Produces: `normalize_to_list(value) -> list`, `select_standard_variant(crafting_requirements) -> dict | None`.

- [ ] **Step 1: Write the failing tests**

`tests/test_recipe_extract.py`:
```python
from recipe_extract import normalize_to_list, select_standard_variant


def test_normalize_to_list_wraps_dict():
    assert normalize_to_list({"a": 1}) == [{"a": 1}]


def test_normalize_to_list_passes_through_list():
    assert normalize_to_list([{"a": 1}, {"b": 2}]) == [{"a": 1}, {"b": 2}]


def test_normalize_to_list_none_becomes_empty_list():
    assert normalize_to_list(None) == []


def test_select_standard_variant_picks_non_faction():
    crafting_requirements = [
        {
            "@craftingfocus": "10",
            "craftresource": [{"@uniquename": "T4_FACTION_TOKEN_MARTLOCK", "@count": "1"}],
        },
        {
            "@craftingfocus": "20",
            "craftresource": [{"@uniquename": "T4_ORE", "@count": "3"}],
        },
    ]
    variant = select_standard_variant(crafting_requirements)
    assert variant["@craftingfocus"] == "20"


def test_select_standard_variant_single_dict_variant():
    crafting_requirements = {
        "@craftingfocus": "54",
        "craftresource": [{"@uniquename": "T4_FIBER", "@count": "2"}],
    }
    variant = select_standard_variant(crafting_requirements)
    assert variant["@craftingfocus"] == "54"


def test_select_standard_variant_returns_none_if_all_faction():
    crafting_requirements = [
        {"craftresource": {"@uniquename": "T4_FACTION_TOKEN_MARTLOCK", "@count": "1"}},
    ]
    assert select_standard_variant(crafting_requirements) is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_recipe_extract.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'recipe_extract'`

- [ ] **Step 3: Write the implementation**

`pipeline/recipe_extract.py`:
```python
"""Extracts craftable-item recipe rows from the parsed ao-bin-dumps item
data. See docs/MECHANICS_SOURCE.md §3.1/§10 for the dict-or-list and
recipe-variant rules this module implements."""

from __future__ import annotations


def normalize_to_list(value):
    """items.json encodes many fields as dict-or-list depending on whether
    there's one or multiple entries. Normalize both to a list."""
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def select_standard_variant(crafting_requirements):
    """craftingrequirements is dict-or-list of recipe variants. Pick the
    first variant whose materials contain no faction/token resources."""
    variants = normalize_to_list(crafting_requirements)
    for variant in variants:
        resources = normalize_to_list(variant.get("craftresource"))
        if not any(
            "FACTION" in r["@uniquename"] or "TOKEN" in r["@uniquename"]
            for r in resources
        ):
            return variant
    return None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_recipe_extract.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add pipeline/recipe_extract.py tests/test_recipe_extract.py
git commit -m "feat(pipeline): dict-or-list normalization and standard-variant selection

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: pipeline/recipe_extract.py — compute_item_value()

**Files:**
- Modify: `pipeline/recipe_extract.py`
- Modify: `tests/test_recipe_extract.py`

**Interfaces:**
- Produces: `compute_item_value(item: dict, variant: dict, iv_lookup: dict) -> tuple[float, bool]` (value, is_estimate).

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_recipe_extract.py`:
```python
from recipe_extract import compute_item_value


def test_compute_item_value_uses_direct_itemvalue():
    item = {"@uniquename": "T4_CLOTH", "@itemvalue": "16"}
    value, is_estimate = compute_item_value(item, variant={}, iv_lookup={})
    assert value == 16.0
    assert is_estimate is False


def test_compute_item_value_sums_ingredients_when_no_direct_value():
    item = {"@uniquename": "T4_HEAD_CLOTH_SET1"}
    variant = {"craftresource": {"@uniquename": "T4_CLOTH", "@count": "8"}}
    iv_lookup = {"T4_CLOTH": 16.0}
    value, is_estimate = compute_item_value(item, variant, iv_lookup)
    assert value == 128.0
    assert is_estimate is True
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_recipe_extract.py -v`
Expected: FAIL with `ImportError: cannot import name 'compute_item_value'`

- [ ] **Step 3: Write the implementation**

Append to `pipeline/recipe_extract.py`:
```python
def compute_item_value(item, variant, iv_lookup):
    """Item value used for the station fee. Refined resources/raws expose
    @itemvalue directly; equipment/consumables sum their ingredients'
    item values (approximate for consumables, per MECHANICS_SOURCE.md §2.5).
    Returns (value, is_estimate).
    """
    direct = item.get("@itemvalue")
    if direct is not None:
        return float(direct), False

    resources = normalize_to_list(variant.get("craftresource"))
    total = 0.0
    for r in resources:
        mat_id = r["@uniquename"]
        count = float(r.get("@count", 1))
        total += iv_lookup.get(mat_id, 0.0) * count
    return total, True
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_recipe_extract.py -v`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add pipeline/recipe_extract.py tests/test_recipe_extract.py
git commit -m "feat(pipeline): item value computation (direct and summed)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: pipeline/recipe_extract.py — resolve_english_name()

**Files:**
- Modify: `pipeline/recipe_extract.py`
- Modify: `tests/test_recipe_extract.py`

**Interfaces:**
- Produces: `resolve_english_name(unique_name: str, en_lookup: dict, enchant: int = 0) -> str`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_recipe_extract.py`:
```python
from recipe_extract import resolve_english_name


def test_resolve_english_name_base():
    assert resolve_english_name("T4_CLOTH", {"T4_CLOTH": "Fine Cloth"}, enchant=0) == "Fine Cloth"


def test_resolve_english_name_enchant_suffix():
    assert resolve_english_name("T4_CLOTH", {"T4_CLOTH": "Fine Cloth"}, enchant=2) == "Fine Cloth .2"


def test_resolve_english_name_missing_falls_back_to_id():
    assert resolve_english_name("T4_UNKNOWN", {}, enchant=0) == "T4_UNKNOWN"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_recipe_extract.py -v`
Expected: FAIL with `ImportError: cannot import name 'resolve_english_name'`

- [ ] **Step 3: Write the implementation**

Append to `pipeline/recipe_extract.py`:
```python
def resolve_english_name(unique_name, en_lookup, enchant=0):
    """Resolve the EN-US localized name. Enchant rows use the base item's
    name with a '.k' suffix (e.g. "Adept's Scholar Cowl .1")."""
    base_name = en_lookup.get(unique_name, unique_name)
    if enchant:
        return f"{base_name} .{enchant}"
    return base_name
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_recipe_extract.py -v`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add pipeline/recipe_extract.py tests/test_recipe_extract.py
git commit -m "feat(pipeline): English name resolution with enchant suffix

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: pipeline/recipe_extract.py — extract_base_row()

**Files:**
- Modify: `pipeline/recipe_extract.py`
- Modify: `tests/test_recipe_extract.py`

**Interfaces:**
- Consumes: `select_standard_variant`, `compute_item_value`, `resolve_english_name`, `normalize_to_list` (this file, Tasks 8-10).
- Produces: `extract_base_row(item: dict, category: str, iv_lookup: dict, en_lookup: dict) -> dict | None`. Returns a dict with keys `item_id, name, tier, enchant, category, shop_category, shop_subcategory, output_amount, item_value, item_value_is_estimate, focus_cost, materials` (materials is `list[{"id": str, "count": float}]`) — this exact key set is the row shape written to `recipes.json` in Task 13 and consumed by the TypeScript `RawRecipeRow` type in Task 18.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_recipe_extract.py`:
```python
from recipe_extract import extract_base_row

T4_CLOTH_ITEM = {
    "@uniquename": "T4_CLOTH",
    "@tier": "4",
    "@itemvalue": "16",
    "@shopcategory": "crafting",
    "@shopsubcategory1": "refinedresources",
    "craftingrequirements": {
        "@craftingfocus": "54",
        "craftresource": [
            {"@uniquename": "T4_FIBER", "@count": "2"},
            {"@uniquename": "T3_CLOTH", "@count": "1"},
        ],
    },
}


def test_extract_base_row_t4_cloth():
    row = extract_base_row(T4_CLOTH_ITEM, "simpleitem", iv_lookup={}, en_lookup={"T4_CLOTH": "Fine Cloth"})
    assert row["item_id"] == "T4_CLOTH"
    assert row["name"] == "Fine Cloth"
    assert row["tier"] == 4
    assert row["enchant"] == 0
    assert row["category"] == "simpleitem"
    assert row["shop_category"] == "crafting"
    assert row["shop_subcategory"] == "refinedresources"
    assert row["output_amount"] == 1
    assert row["item_value"] == 16.0
    assert row["item_value_is_estimate"] is False
    assert row["focus_cost"] == 54.0
    assert row["materials"] == [
        {"id": "T4_FIBER", "count": 2.0},
        {"id": "T3_CLOTH", "count": 1.0},
    ]


def test_extract_base_row_returns_none_for_uncraftable_item():
    item = {"@uniquename": "T4_QUESTITEM", "@tier": "4"}
    assert extract_base_row(item, "simpleitem", {}, {}) is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_recipe_extract.py -v`
Expected: FAIL with `ImportError: cannot import name 'extract_base_row'`

- [ ] **Step 3: Write the implementation**

Append to `pipeline/recipe_extract.py`:
```python
def extract_base_row(item, category, iv_lookup, en_lookup):
    """Extract the base (.0) recipe row for a craftable item. Returns None
    if the item has no craftingrequirements (uncraftable)."""
    crafting_requirements = item.get("craftingrequirements")
    if not crafting_requirements:
        return None
    variant = select_standard_variant(crafting_requirements)
    if variant is None:
        return None

    resources = normalize_to_list(variant.get("craftresource"))
    materials = [
        {"id": r["@uniquename"], "count": float(r.get("@count", 1))}
        for r in resources
    ]
    item_value, is_estimate = compute_item_value(item, variant, iv_lookup)
    unique_name = item["@uniquename"]

    return {
        "item_id": unique_name,
        "name": resolve_english_name(unique_name, en_lookup, enchant=0),
        "tier": int(item.get("@tier", 0)),
        "enchant": 0,
        "category": category,
        "shop_category": item.get("@shopcategory", ""),
        "shop_subcategory": item.get("@shopsubcategory1", ""),
        "output_amount": int(float(variant.get("@amountcrafted", 1))),
        "item_value": item_value,
        "item_value_is_estimate": is_estimate,
        "focus_cost": float(variant.get("@craftingfocus", 0) or 0),
        "materials": materials,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_recipe_extract.py -v`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add pipeline/recipe_extract.py tests/test_recipe_extract.py
git commit -m "feat(pipeline): base recipe row extraction

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 12: pipeline/recipe_extract.py — enchant row extraction (resource + equipment paths)

**Files:**
- Modify: `pipeline/recipe_extract.py`
- Modify: `tests/test_recipe_extract.py`

**Interfaces:**
- Consumes: `extract_base_row`, `select_standard_variant`, `compute_item_value`, `resolve_english_name`, `normalize_to_list`.
- Produces: `extract_enchant_rows_for_resource(base_item: dict, enchant_items: dict[int, dict], category: str, iv_lookup: dict, en_lookup: dict) -> list[dict]`, `extract_enchant_rows_for_equipment(base_item: dict, category: str, iv_lookup: dict, en_lookup: dict) -> list[dict]`. Both return rows with the same key shape as `extract_base_row` (Task 11).

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_recipe_extract.py`:
```python
from recipe_extract import extract_enchant_rows_for_resource, extract_enchant_rows_for_equipment

T4_CLOTH_LEVEL1_ITEM = {
    "@uniquename": "T4_CLOTH_LEVEL1",
    "@tier": "4",
    "@itemvalue": "32",
    "@shopcategory": "crafting",
    "@shopsubcategory1": "refinedresources",
    "craftingrequirements": {
        "@craftingfocus": "62",
        "craftresource": [
            {"@uniquename": "T4_FIBER_LEVEL1", "@count": "2"},
            {"@uniquename": "T3_CLOTH", "@count": "1"},
        ],
    },
}


def test_extract_enchant_rows_for_resource():
    siblings = {1: T4_CLOTH_LEVEL1_ITEM}
    en_lookup = {"T4_CLOTH": "Fine Cloth"}
    rows = extract_enchant_rows_for_resource(T4_CLOTH_ITEM, siblings, "simpleitem", iv_lookup={}, en_lookup=en_lookup)
    assert len(rows) == 1
    assert rows[0]["item_id"] == "T4_CLOTH_LEVEL1"
    assert rows[0]["name"] == "Fine Cloth .1"
    assert rows[0]["enchant"] == 1
    assert rows[0]["item_value"] == 32.0  # doubled per enchant level, direct from the dump


T4_HEAD_CLOTH_SET1_ITEM = {
    "@uniquename": "T4_HEAD_CLOTH_SET1",
    "@tier": "4",
    "@shopcategory": "crafting",
    "@shopsubcategory1": "cloth_helmet",
    "craftingrequirements": {
        "@craftingfocus": "429",
        "craftresource": {"@uniquename": "T4_CLOTH", "@count": "8"},
    },
    "enchantments": {
        "enchantment": {
            "@enchantmentlevel": "1",
            "craftingrequirements": {
                "@craftingfocus": "429",
                "craftresource": {"@uniquename": "T4_CLOTH_LEVEL1", "@count": "8"},
            },
        }
    },
}


def test_extract_enchant_rows_for_equipment():
    iv_lookup = {"T4_CLOTH_LEVEL1": 32.0}
    en_lookup = {"T4_HEAD_CLOTH_SET1": "Adept's Scholar Cowl"}
    rows = extract_enchant_rows_for_equipment(T4_HEAD_CLOTH_SET1_ITEM, "equipmentitem", iv_lookup, en_lookup)
    assert len(rows) == 1
    row = rows[0]
    assert row["item_id"] == "T4_HEAD_CLOTH_SET1@1"
    assert row["name"] == "Adept's Scholar Cowl .1"
    assert row["enchant"] == 1
    assert row["shop_subcategory"] == "cloth_helmet"
    assert row["materials"] == [{"id": "T4_CLOTH_LEVEL1", "count": 8.0}]
    assert row["item_value"] == 256.0
    assert row["item_value_is_estimate"] is True
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_recipe_extract.py -v`
Expected: FAIL with `ImportError: cannot import name 'extract_enchant_rows_for_resource'`

- [ ] **Step 3: Write the implementation**

Append to `pipeline/recipe_extract.py`:
```python
def extract_enchant_rows_for_resource(base_item, enchant_items, category, iv_lookup, en_lookup):
    """Enchanted refined resources are separate simpleitems named
    T{tier}_{RES}_LEVEL{k}. `enchant_items` maps level (1-4) -> that item's
    dict, already looked up by the caller from the full item catalog."""
    rows = []
    for level, enchant_item in sorted(enchant_items.items()):
        row = extract_base_row(enchant_item, category, iv_lookup, en_lookup)
        if row is None:
            continue
        row["enchant"] = level
        row["item_id"] = base_item["@uniquename"] + f"_LEVEL{level}"
        row["name"] = resolve_english_name(base_item["@uniquename"], en_lookup, enchant=level)
        rows.append(row)
    return rows


def extract_enchant_rows_for_equipment(base_item, category, iv_lookup, en_lookup):
    """Enchanted equipment/consumables/mounts live under
    enchantments.enchantment[], each with its own craftingrequirements using
    the enchanted resource."""
    rows = []
    enchantments = normalize_to_list(
        (base_item.get("enchantments") or {}).get("enchantment")
    )
    for ench in enchantments:
        level = int(ench.get("@enchantmentlevel", 0))
        if level == 0:
            continue
        crafting_requirements = ench.get("craftingrequirements")
        if not crafting_requirements:
            continue
        variant = select_standard_variant(crafting_requirements)
        if variant is None:
            continue
        resources = normalize_to_list(variant.get("craftresource"))
        materials = [
            {"id": r["@uniquename"], "count": float(r.get("@count", 1))}
            for r in resources
        ]
        item_value, is_estimate = compute_item_value(base_item, variant, iv_lookup)
        unique_name = base_item["@uniquename"]
        rows.append({
            "item_id": f"{unique_name}@{level}",
            "name": resolve_english_name(unique_name, en_lookup, enchant=level),
            "tier": int(base_item.get("@tier", 0)),
            "enchant": level,
            "category": category,
            "shop_category": base_item.get("@shopcategory", ""),
            "shop_subcategory": base_item.get("@shopsubcategory1", ""),
            "output_amount": int(float(variant.get("@amountcrafted", 1))),
            "item_value": item_value,
            "item_value_is_estimate": is_estimate,
            "focus_cost": float(variant.get("@craftingfocus", 0) or 0),
            "materials": materials,
        })
    return rows
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_recipe_extract.py -v`
Expected: PASS (14 tests)

- [ ] **Step 5: Commit**

```bash
git add pipeline/recipe_extract.py tests/test_recipe_extract.py
git commit -m "feat(pipeline): enchant row extraction for resources and equipment

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 13: pipeline/generate_recipes.py — main orchestration script

**Files:**
- Create: `pipeline/generate_recipes.py`
- Create: `tests/test_pipeline.py`

**Interfaces:**
- Consumes: `load_items`, `load_localized_names` (Task 7); `extract_base_row`, `extract_enchant_rows_for_resource`, `extract_enchant_rows_for_equipment`, `normalize_to_list` (Tasks 8-12).
- Produces: `generate(items_data: dict, localized_names: list) -> tuple[list[dict], dict]`, `main(refresh: bool = False, data_dir: pathlib.Path = DATA_DIR) -> None`. Writes `data_dir/recipes.json` and `data_dir/recipes_core.json`. `DATA_DIR` defaults to `<repo_root>/app/public/data` — this is the path Task 18's `loadRecipes.ts` fetches from.

- [ ] **Step 1: Write the failing tests**

`tests/test_pipeline.py`:
```python
import json

T4_CLOTH_ITEM = {
    "@uniquename": "T4_CLOTH",
    "@tier": "4",
    "@itemvalue": "16",
    "@shopcategory": "crafting",
    "@shopsubcategory1": "refinedresources",
    "craftingrequirements": {
        "@craftingfocus": "54",
        "craftresource": [
            {"@uniquename": "T4_FIBER", "@count": "2"},
            {"@uniquename": "T3_CLOTH", "@count": "1"},
        ],
    },
}

T4_CLOTH_LEVEL1_ITEM = {
    "@uniquename": "T4_CLOTH_LEVEL1",
    "@tier": "4",
    "@itemvalue": "32",
    "@shopcategory": "crafting",
    "@shopsubcategory1": "refinedresources",
    "craftingrequirements": {
        "@craftingfocus": "62",
        "craftresource": [
            {"@uniquename": "T4_FIBER_LEVEL1", "@count": "2"},
            {"@uniquename": "T3_CLOTH", "@count": "1"},
        ],
    },
}

T4_HEAD_CLOTH_SET1_ITEM = {
    "@uniquename": "T4_HEAD_CLOTH_SET1",
    "@tier": "4",
    "@shopcategory": "crafting",
    "@shopsubcategory1": "cloth_helmet",
    "craftingrequirements": {
        "@craftingfocus": "429",
        "craftresource": {"@uniquename": "T4_CLOTH", "@count": "8"},
    },
    "enchantments": {
        "enchantment": {
            "@enchantmentlevel": "1",
            "craftingrequirements": {
                "@craftingfocus": "429",
                "craftresource": {"@uniquename": "T4_CLOTH_LEVEL1", "@count": "8"},
            },
        }
    },
}

T4_MOUNT_OX_ITEM = {
    "@uniquename": "T4_MOUNT_OX",
    "@tier": "4",
    "@shopcategory": "crafting",
    "@shopsubcategory1": "basemounts",
    "craftingrequirements": {
        "@craftingfocus": "200",
        "craftresource": [{"@uniquename": "T4_HIDE", "@count": "12"}],
    },
}

ITEMS_DATA = {
    "simpleitem": [
        T4_CLOTH_ITEM,
        T4_CLOTH_LEVEL1_ITEM,
        {"@uniquename": "T3_CLOTH", "@tier": "3", "@itemvalue": "8"},  # no craftingrequirements: skipped
    ],
    "equipmentitem": [T4_HEAD_CLOTH_SET1_ITEM],
    "weapon": [],
    "consumableitem": [],
    "mount": [T4_MOUNT_OX_ITEM],
}

LOCALIZED_NAMES = [
    {"UniqueName": "T4_CLOTH", "LocalizedNames": {"EN-US": "Fine Cloth"}},
    {"UniqueName": "T4_HEAD_CLOTH_SET1", "LocalizedNames": {"EN-US": "Adept's Scholar Cowl"}},
]


def test_generate_is_deterministic():
    from generate_recipes import generate

    rows1, summary1 = generate(ITEMS_DATA, LOCALIZED_NAMES)
    rows2, summary2 = generate(ITEMS_DATA, LOCALIZED_NAMES)
    assert rows1 == rows2
    assert summary1 == summary2


def test_generate_includes_base_and_enchant_rows():
    from generate_recipes import generate

    rows, summary = generate(ITEMS_DATA, LOCALIZED_NAMES)
    item_ids = {r["item_id"] for r in rows}
    assert "T4_CLOTH" in item_ids
    assert "T4_CLOTH_LEVEL1" in item_ids
    assert "T4_HEAD_CLOTH_SET1" in item_ids
    assert "T4_HEAD_CLOTH_SET1@1" in item_ids
    assert "T4_MOUNT_OX" in item_ids
    assert summary["per_category"]["simpleitem"] == 2
    assert summary["per_category"]["equipmentitem"] == 2
    assert summary["per_category"]["mount"] == 1
    assert any(item_id == "T3_CLOTH" for item_id, _reason in summary["skipped"])


def test_generate_extracts_mount_category():
    from generate_recipes import generate

    rows, _summary = generate(ITEMS_DATA, LOCALIZED_NAMES)
    mount_row = next(r for r in rows if r["item_id"] == "T4_MOUNT_OX")
    assert mount_row["category"] == "mount"
    assert mount_row["materials"] == [{"id": "T4_HIDE", "count": 12.0}]
    assert mount_row["focus_cost"] == 200.0


def test_generate_sorts_rows_deterministically():
    from generate_recipes import generate

    rows, _summary = generate(ITEMS_DATA, LOCALIZED_NAMES)
    keys = [(r["category"], r["tier"], r["item_id"], r["enchant"]) for r in rows]
    assert keys == sorted(keys)


def test_main_writes_recipes_and_core_files(tmp_path):
    from unittest.mock import patch
    from generate_recipes import main

    with patch("generate_recipes.load_items", return_value=ITEMS_DATA), \
         patch("generate_recipes.load_localized_names", return_value=LOCALIZED_NAMES):
        main(refresh=False, data_dir=tmp_path)

    recipes = json.loads((tmp_path / "recipes.json").read_text(encoding="utf-8"))
    core = json.loads((tmp_path / "recipes_core.json").read_text(encoding="utf-8"))
    assert len(recipes) == 5
    assert any(r["item_id"] == "T4_CLOTH" for r in core)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_pipeline.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'generate_recipes'`

- [ ] **Step 3: Write the implementation**

`pipeline/generate_recipes.py`:
```python
"""Generates app/public/data/recipes.json (full catalog) and
app/public/data/recipes_core.json (a small subset for fast iteration) from
the ao-bin-dumps item data.

Usage:
    python generate_recipes.py [--refresh]
"""

from __future__ import annotations

import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from download import load_items, load_localized_names  # noqa: E402
from recipe_extract import (  # noqa: E402
    extract_base_row,
    extract_enchant_rows_for_equipment,
    extract_enchant_rows_for_resource,
    normalize_to_list,
)

DATA_DIR = pathlib.Path(__file__).parent.parent / "app" / "public" / "data"
CRAFTABLE_CATEGORIES = ["simpleitem", "equipmentitem", "weapon", "consumableitem", "mount"]

# Core subset from the original prototype: all 5 refining lines T2-T8 incl.
# .1-.4, the cloth armor set T4-T8 incl. enchants, and the heal potion line
# T4-T8. Used for fast iteration and as a smoke-test dataset.
CORE_ID_PREFIXES = (
    "T2_WOOD", "T3_WOOD", "T4_WOOD", "T5_WOOD", "T6_WOOD", "T7_WOOD", "T8_WOOD",
    "T2_PLANKS", "T3_PLANKS", "T4_PLANKS", "T5_PLANKS", "T6_PLANKS", "T7_PLANKS", "T8_PLANKS",
    "T2_ORE", "T3_ORE", "T4_ORE", "T5_ORE", "T6_ORE", "T7_ORE", "T8_ORE",
    "T2_METALBAR", "T3_METALBAR", "T4_METALBAR", "T5_METALBAR", "T6_METALBAR", "T7_METALBAR", "T8_METALBAR",
    "T2_FIBER", "T3_FIBER", "T4_FIBER", "T5_FIBER", "T6_FIBER", "T7_FIBER", "T8_FIBER",
    "T2_CLOTH", "T3_CLOTH", "T4_CLOTH", "T5_CLOTH", "T6_CLOTH", "T7_CLOTH", "T8_CLOTH",
    "T2_HIDE", "T3_HIDE", "T4_HIDE", "T5_HIDE", "T6_HIDE", "T7_HIDE", "T8_HIDE",
    "T2_LEATHER", "T3_LEATHER", "T4_LEATHER", "T5_LEATHER", "T6_LEATHER", "T7_LEATHER", "T8_LEATHER",
    "T2_ROCK", "T3_ROCK", "T4_ROCK", "T5_ROCK", "T6_ROCK", "T7_ROCK", "T8_ROCK",
    "T2_STONEBLOCK", "T3_STONEBLOCK", "T4_STONEBLOCK", "T5_STONEBLOCK", "T6_STONEBLOCK", "T7_STONEBLOCK", "T8_STONEBLOCK",
    "T4_HEAD_CLOTH_SET1", "T5_HEAD_CLOTH_SET1", "T6_HEAD_CLOTH_SET1", "T7_HEAD_CLOTH_SET1", "T8_HEAD_CLOTH_SET1",
    "T4_ARMOR_CLOTH_SET1", "T5_ARMOR_CLOTH_SET1", "T6_ARMOR_CLOTH_SET1", "T7_ARMOR_CLOTH_SET1", "T8_ARMOR_CLOTH_SET1",
    "T4_SHOES_CLOTH_SET1", "T5_SHOES_CLOTH_SET1", "T6_SHOES_CLOTH_SET1", "T7_SHOES_CLOTH_SET1", "T8_SHOES_CLOTH_SET1",
    "T4_POTION_HEAL", "T5_POTION_HEAL", "T6_POTION_HEAL", "T7_POTION_HEAL", "T8_POTION_HEAL",
)


def build_iv_lookup(simple_items: list) -> dict:
    lookup = {}
    for item in simple_items:
        if "@itemvalue" in item:
            lookup[item["@uniquename"]] = float(item["@itemvalue"])
    return lookup


def build_en_lookup(localized_names: list) -> dict:
    lookup = {}
    for entry in localized_names:
        name = entry.get("LocalizedNames", {}).get("EN-US")
        if name:
            lookup[entry["UniqueName"]] = name
    return lookup


def find_resource_enchant_siblings(base_item_id: str, simple_items_by_id: dict) -> dict:
    """For a base refined resource, finds any T{tier}_{RES}_LEVELk siblings
    among the other simpleitems and returns {level: item_dict}."""
    siblings = {}
    for level in (1, 2, 3, 4):
        candidate_id = f"{base_item_id}_LEVEL{level}"
        if candidate_id in simple_items_by_id:
            siblings[level] = simple_items_by_id[candidate_id]
    return siblings


def generate(items_data: dict, localized_names: list) -> tuple[list, dict]:
    """Returns (rows, summary)."""
    simple_items = normalize_to_list(items_data.get("simpleitem"))
    iv_lookup = build_iv_lookup(simple_items)
    en_lookup = build_en_lookup(localized_names)
    simple_items_by_id = {i["@uniquename"]: i for i in simple_items}

    rows = []
    summary = {"per_category": {}, "skipped": []}

    for category in CRAFTABLE_CATEGORIES:
        items = normalize_to_list(items_data.get(category))
        emitted = 0
        for item in items:
            item_id = item.get("@uniquename", "<unknown>")
            base_row = extract_base_row(item, category, iv_lookup, en_lookup)
            if base_row is None:
                summary["skipped"].append((item_id, "no craftingrequirements"))
                continue
            rows.append(base_row)
            emitted += 1

            if category == "simpleitem":
                siblings = find_resource_enchant_siblings(item_id, simple_items_by_id)
                enchant_rows = extract_enchant_rows_for_resource(
                    item, siblings, category, iv_lookup, en_lookup
                )
            else:
                enchant_rows = extract_enchant_rows_for_equipment(
                    item, category, iv_lookup, en_lookup
                )
            rows.extend(enchant_rows)
            emitted += len(enchant_rows)

        summary["per_category"][category] = emitted

    rows.sort(key=lambda r: (r["category"], r["tier"], r["item_id"], r["enchant"]))
    summary["total_rows"] = len(rows)
    summary["max_material_columns"] = max((len(r["materials"]) for r in rows), default=0)

    return rows, summary


def main(refresh: bool = False, data_dir: pathlib.Path = DATA_DIR) -> None:
    items_data = load_items(refresh)
    localized_names = load_localized_names(refresh)

    rows, summary = generate(items_data, localized_names)

    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "recipes.json").write_text(
        json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    core_rows = [
        r for r in rows
        if r["item_id"].split("_LEVEL")[0].split("@")[0] in CORE_ID_PREFIXES
    ]
    (data_dir / "recipes_core.json").write_text(
        json.dumps(core_rows, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    print(f"Wrote {len(rows)} rows to {data_dir / 'recipes.json'}")
    print(f"Wrote {len(core_rows)} rows to {data_dir / 'recipes_core.json'}")
    for category, count in summary["per_category"].items():
        print(f"  {category}: {count} rows")
    print(f"Max material columns: {summary['max_material_columns']}")
    print(f"Skipped {len(summary['skipped'])} items (no craftingrequirements)")


if __name__ == "__main__":
    main(refresh="--refresh" in sys.argv)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_pipeline.py -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Run the full pipeline test suite**

Run: `pytest -v`
Expected: PASS (all tests from Tasks 2-13, ~55 tests total)

- [ ] **Step 6: Commit**

```bash
git add pipeline/generate_recipes.py tests/test_pipeline.py
git commit -m "feat(pipeline): main orchestration script producing recipes.json

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 14: App scaffold — Vite + React + TypeScript + Vitest

**Files:**
- Create: `app/package.json`
- Create: `app/vite.config.ts`
- Create: `app/tsconfig.json`
- Create: `app/index.html`
- Create: `app/src/main.tsx`
- Create: `app/src/setupTests.ts`
- Create: `app/.gitignore` (app-local, in addition to the root one from Task 1)

**Interfaces:**
- Produces: a buildable, testable Vite React TS project at `app/`.

- [ ] **Step 1: Create package.json**

`app/package.json`:
```json
{
  "name": "albion-crafting-tool",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.8",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^24.1.1",
    "typescript": "^5.5.3",
    "vite": "^5.3.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Create vite.config.ts**

`app/vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Must match the GitHub Pages repo path, e.g. github.com/<user>/albion-crafting-tool
  // -> https://<user>.github.io/albion-crafting-tool/. Adjust if the repo is renamed.
  base: '/albion-crafting-tool/',
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.ts',
  },
});
```

- [ ] **Step 3: Create tsconfig.json**

`app/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create index.html**

`app/index.html`:
```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Albion Crafting &amp; Market Profit Tool</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create setupTests.ts and a stub main.tsx**

`app/src/setupTests.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

`app/src/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div>Albion Crafting Tool — Setup OK</div>
  </React.StrictMode>
);
```

`app/.gitignore`:
```
node_modules/
dist/
```

- [ ] **Step 6: Install dependencies and verify the build**

Run: `cd app && npm install && npm run build`
Expected: succeeds, produces `app/dist/`

- [ ] **Step 7: Commit**

```bash
git add app/package.json app/package-lock.json app/vite.config.ts app/tsconfig.json app/index.html app/src/main.tsx app/src/setupTests.ts app/.gitignore
git commit -m "chore(app): scaffold Vite + React + TypeScript + Vitest

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 15: src/calc/returnRate.ts

**Files:**
- Create: `app/src/calc/returnRate.ts`
- Test: `app/src/calc/__tests__/returnRate.test.ts`

**Interfaces:**
- Produces: `resourceReturnRate(input: ReturnRateInput): number`, `isNonReturnable(itemId: string): boolean`, `ReturnRateInput` interface with fields `baseCityBonus, specBonus?, dailyBonus?, hideoutBonus?, useFocus?`.

- [ ] **Step 1: Write the failing test**

`app/src/calc/__tests__/returnRate.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resourceReturnRate, isNonReturnable } from '../returnRate';

describe('resourceReturnRate', () => {
  it('computes base royal city RRR (bonus 0.18)', () => {
    expect(resourceReturnRate({ baseCityBonus: 0.18 })).toBeCloseTo(0.1525, 4);
  });

  it('computes RRR with focus (shared test config: bonus 0.77)', () => {
    const rrr = resourceReturnRate({ baseCityBonus: 0.18, useFocus: true });
    expect(rrr).toBeCloseTo(0.435, 4);
  });

  it('adds a generic hideout/guild bonus on top of the stack', () => {
    const rrr = resourceReturnRate({
      baseCityBonus: 0.18,
      specBonus: 0.15,
      hideoutBonus: 0.1,
      useFocus: true,
    });
    expect(rrr).toBeCloseTo(0.505, 3);
  });
});

describe('isNonReturnable', () => {
  it('flags artifacts, runes, souls, relics and tokens', () => {
    expect(isNonReturnable('T5_ARTEFACT_FOCUS_AVALON')).toBe(true);
    expect(isNonReturnable('T4_RUNE')).toBe(true);
    expect(isNonReturnable('T4_SOUL')).toBe(true);
    expect(isNonReturnable('T4_RELIC')).toBe(true);
    expect(isNonReturnable('T4_FACTION_TOKEN_MARTLOCK')).toBe(true);
  });

  it('does not flag regular materials', () => {
    expect(isNonReturnable('T4_CLOTH')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm run test -- returnRate`
Expected: FAIL — cannot find module `../returnRate`

- [ ] **Step 3: Write the implementation**

`app/src/calc/returnRate.ts`:
```ts
// Resource Return Rate (RRR) — mirrors pipeline/calc_reference.py
// resource_return_rate(). See docs/MECHANICS_SOURCE.md §2.1.

export interface ReturnRateInput {
  baseCityBonus: number;
  specBonus?: number;
  dailyBonus?: number;
  hideoutBonus?: number;
  useFocus?: boolean;
}

const FOCUS_BONUS = 0.59;

export function resourceReturnRate(input: ReturnRateInput): number {
  const {
    baseCityBonus,
    specBonus = 0,
    dailyBonus = 0,
    hideoutBonus = 0,
    useFocus = false,
  } = input;
  let bonus = baseCityBonus + specBonus + dailyBonus + hideoutBonus;
  if (useFocus) bonus += FOCUS_BONUS;
  return bonus / (1 + bonus);
}

const NON_RETURNABLE_SUBSTRINGS = ['ARTEFACT', '_RUNE', '_SOUL', '_RELIC', 'TOKEN'];

export function isNonReturnable(itemId: string): boolean {
  return NON_RETURNABLE_SUBSTRINGS.some((s) => itemId.includes(s));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm run test -- returnRate`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/calc/returnRate.ts app/src/calc/__tests__/returnRate.test.ts
git commit -m "feat(app/calc): resource return rate formula (TypeScript mirror)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 16: src/calc/costs.ts

**Files:**
- Create: `app/src/calc/costs.ts`
- Test: `app/src/calc/__tests__/costs.test.ts`

**Interfaces:**
- Consumes: `isNonReturnable` from `./returnRate` (Task 15).
- Produces: `stationFee(itemValue: number, feePer100Nutrition: number, tier: number): number`, `materialCost(materials: PricedMaterial[], rrr: number): number`, `PricedMaterial` interface `{ id: string; count: number; price: number }`.

- [ ] **Step 1: Write the failing test**

`app/src/calc/__tests__/costs.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { stationFee, materialCost } from '../costs';

describe('stationFee', () => {
  it('computes the T4 cloth station fee', () => {
    expect(stationFee(16, 150, 4)).toBeCloseTo(2.7, 2);
  });

  it('is zero for T1/T2', () => {
    expect(stationFee(999, 150, 1)).toBe(0);
    expect(stationFee(999, 150, 2)).toBe(0);
  });
});

describe('materialCost', () => {
  it('applies RRR to regular materials', () => {
    const cost = materialCost(
      [
        { id: 'T4_FIBER', count: 2, price: 200 },
        { id: 'T3_CLOTH', count: 1, price: 150 },
      ],
      0.435
    );
    expect(cost).toBeCloseTo(310.75, 2);
  });

  it('charges non-returnable materials at full price', () => {
    const cost = materialCost([{ id: 'T4_FACTION_TOKEN_MARTLOCK', count: 3, price: 100 }], 0.9);
    expect(cost).toBe(300);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm run test -- costs`
Expected: FAIL — cannot find module `../costs`

- [ ] **Step 3: Write the implementation**

`app/src/calc/costs.ts`:
```ts
// Station fee and material cost — mirrors pipeline/calc_reference.py
// station_fee() and material_cost(). See docs/MECHANICS_SOURCE.md §2.4/§2.1.

import { isNonReturnable } from './returnRate';

export function stationFee(itemValue: number, feePer100Nutrition: number, tier: number): number {
  if (tier <= 2) return 0;
  const nutrition = itemValue * 0.1125;
  return nutrition * (feePer100Nutrition / 100);
}

export interface PricedMaterial {
  id: string;
  count: number;
  price: number;
}

export function materialCost(materials: PricedMaterial[], rrr: number): number {
  let total = 0;
  for (const mat of materials) {
    const rawCost = mat.price * mat.count;
    total += isNonReturnable(mat.id) ? rawCost : rawCost * (1 - rrr);
  }
  return total;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm run test -- costs`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/calc/costs.ts app/src/calc/__tests__/costs.test.ts
git commit -m "feat(app/calc): station fee and material cost formulas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 17: src/calc/profit.ts — craftProfit() integration + acceptance tests

**Files:**
- Create: `app/src/calc/profit.ts`
- Test: `app/src/calc/__tests__/profit.test.ts`

**Interfaces:**
- Consumes: `materialCost`, `stationFee`, `PricedMaterial` from `./costs` (Task 16).
- Produces: `netRevenuePerUnit`, `profit`, `silverPerFocus`, `craftProfit(input: CraftProfitInput): CraftProfitResult`. `CraftProfitInput` fields: `materials: MaterialInput[], outputAmount, itemValue, focusCost, tier, sellPrice: number | null, rrr, feePer100Nutrition, salesTax, setupFee`. `MaterialInput`: `{ id: string; count: number; price: number | null }`. `CraftProfitResult` fields: `materialCost, fee, costPerUnit, netRevenue, profitPerUnit, marginPct, profitPerBatch, silverPerFocus` (all `number | null`) plus `noPriceData: boolean`. This is consumed directly by `Dashboard.tsx` in Task 26 — keep these exact field names.

- [ ] **Step 1: Write the failing tests**

`app/src/calc/__tests__/profit.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { craftProfit, netRevenuePerUnit, profit, silverPerFocus } from '../profit';
import { resourceReturnRate } from '../returnRate';

describe('netRevenuePerUnit / profit / silverPerFocus', () => {
  it('computes net revenue', () => {
    expect(netRevenuePerUnit(600, 0.04, 0.025)).toBeCloseTo(561.0, 2);
  });

  it('computes profit', () => {
    expect(profit(313.45, 561.0)).toBeCloseTo(247.55, 2);
  });

  it('computes silver per focus', () => {
    expect(silverPerFocus(247.55, 54)).toBeCloseTo(4.584, 3);
  });

  it('returns null for zero focus cost', () => {
    expect(silverPerFocus(100, 0)).toBeNull();
  });
});

// Rounded to 4 dp to match docs/MECHANICS_SOURCE.md §8's shared worked-example
// config ("RRR = 0.77/1.77 = 0.4350 (4 dp)"). The raw unrounded division
// (0.43502824...) is off by more than the 2-3 decimal toBeCloseTo tolerance
// below once multiplied through a materials sum of a few hundred silver.
const SHARED_RRR = Math.round(resourceReturnRate({ baseCityBonus: 0.18, useFocus: true }) * 10000) / 10000;

describe('craftProfit', () => {
  it('matches the refining acceptance example (T4_CLOTH)', () => {
    const result = craftProfit({
      materials: [
        { id: 'T4_FIBER', count: 2, price: 200 },
        { id: 'T3_CLOTH', count: 1, price: 150 },
      ],
      outputAmount: 1,
      itemValue: 16,
      focusCost: 54,
      tier: 4,
      sellPrice: 600,
      rrr: SHARED_RRR,
      feePer100Nutrition: 150,
      salesTax: 0.04,
      setupFee: 0.025,
    });
    expect(result.noPriceData).toBe(false);
    expect(result.materialCost).toBeCloseTo(310.75, 2);
    expect(result.fee).toBeCloseTo(2.7, 2);
    expect(result.costPerUnit).toBeCloseTo(313.45, 2);
    expect(result.netRevenue).toBeCloseTo(561.0, 2);
    expect(result.profitPerUnit).toBeCloseTo(247.55, 2);
    expect(result.marginPct).toBeCloseTo(0.79, 3);
    expect(result.silverPerFocus).toBeCloseTo(4.584, 3);
  });

  it('matches the gear acceptance example (T4_HEAD_CLOTH_SET1)', () => {
    const result = craftProfit({
      materials: [{ id: 'T4_CLOTH', count: 8, price: 600 }],
      outputAmount: 1,
      itemValue: 128,
      focusCost: 429,
      tier: 4,
      sellPrice: 4000,
      rrr: SHARED_RRR,
      feePer100Nutrition: 150,
      salesTax: 0.04,
      setupFee: 0.025,
    });
    expect(result.costPerUnit).toBeCloseTo(2733.6, 2);
    expect(result.netRevenue).toBeCloseTo(3740.0, 2);
    expect(result.profitPerUnit).toBeCloseTo(1006.4, 2);
    expect(result.marginPct).toBeCloseTo(0.368, 3);
    expect(result.silverPerFocus).toBeCloseTo(2.346, 3);
  });

  it('flags NO_PRICE_DATA when the sell price is missing', () => {
    const result = craftProfit({
      materials: [{ id: 'T4_CLOTH', count: 8, price: 600 }],
      outputAmount: 1,
      itemValue: 128,
      focusCost: 429,
      tier: 4,
      sellPrice: null,
      rrr: SHARED_RRR,
      feePer100Nutrition: 150,
      salesTax: 0.04,
      setupFee: 0.025,
    });
    expect(result.noPriceData).toBe(true);
    expect(result.profitPerUnit).toBeNull();
  });

  it('flags NO_PRICE_DATA when a material price is missing', () => {
    const result = craftProfit({
      materials: [{ id: 'T4_CLOTH', count: 8, price: null }],
      outputAmount: 1,
      itemValue: 128,
      focusCost: 429,
      tier: 4,
      sellPrice: 4000,
      rrr: SHARED_RRR,
      feePer100Nutrition: 150,
      salesTax: 0.04,
      setupFee: 0.025,
    });
    expect(result.noPriceData).toBe(true);
  });

  it('charges zero station fee for T1/T2', () => {
    const result = craftProfit({
      materials: [{ id: 'T2_ORE', count: 2, price: 10 }],
      outputAmount: 1,
      itemValue: 4,
      focusCost: 5,
      tier: 2,
      sellPrice: 20,
      rrr: SHARED_RRR,
      feePer100Nutrition: 150,
      salesTax: 0.04,
      setupFee: 0.025,
    });
    expect(result.fee).toBe(0);
  });

  it('divides batch cost by output amount for a 5x potion craft', () => {
    const result = craftProfit({
      materials: [{ id: 'T4_TESTHERB', count: 10, price: 20 }],
      outputAmount: 5,
      itemValue: 50,
      focusCost: 100,
      tier: 4,
      sellPrice: 100,
      rrr: SHARED_RRR,
      feePer100Nutrition: 150,
      salesTax: 0.04,
      setupFee: 0.025,
    });
    expect(result.costPerUnit).toBeCloseTo(24.2875, 3);
    expect(result.profitPerBatch).toBeCloseTo(346.06, 1);
    expect(result.silverPerFocus).toBeCloseTo(3.4606, 3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm run test -- profit`
Expected: FAIL — cannot find module `../profit`

- [ ] **Step 3: Write the implementation**

`app/src/calc/profit.ts`:
```ts
// Net revenue, profit, silver-per-focus and the full craftProfit()
// integration — mirrors pipeline/calc_reference.py. See
// docs/MECHANICS_SOURCE.md §2.3/§2.6 and §8 for the acceptance numbers.

import { materialCost, stationFee, PricedMaterial } from './costs';

export function netRevenuePerUnit(sellPrice: number, salesTax: number, setupFee: number): number {
  return sellPrice * (1 - salesTax - setupFee);
}

export function profit(costPerUnit: number, netRevenue: number): number {
  return netRevenue - costPerUnit;
}

export function silverPerFocus(profitPerBatch: number, baseFocusCost: number): number | null {
  if (!baseFocusCost) return null;
  return profitPerBatch / baseFocusCost;
}

export interface MaterialInput {
  id: string;
  count: number;
  price: number | null;
}

export interface CraftProfitInput {
  materials: MaterialInput[];
  outputAmount: number;
  itemValue: number;
  focusCost: number;
  tier: number;
  sellPrice: number | null;
  rrr: number;
  feePer100Nutrition: number;
  salesTax: number;
  setupFee: number;
}

export interface CraftProfitResult {
  materialCost: number | null;
  fee: number | null;
  costPerUnit: number | null;
  netRevenue: number | null;
  profitPerUnit: number | null;
  marginPct: number | null;
  profitPerBatch: number | null;
  silverPerFocus: number | null;
  noPriceData: boolean;
}

export function craftProfit(input: CraftProfitInput): CraftProfitResult {
  const missingMaterialPrice = input.materials.some((m) => m.price === null || m.price === 0);
  if (missingMaterialPrice || input.sellPrice === null || input.sellPrice === 0) {
    return {
      materialCost: null,
      fee: null,
      costPerUnit: null,
      netRevenue: null,
      profitPerUnit: null,
      marginPct: null,
      profitPerBatch: null,
      silverPerFocus: null,
      noPriceData: true,
    };
  }

  const pricedMaterials: PricedMaterial[] = input.materials.map((m) => ({
    id: m.id,
    count: m.count,
    price: m.price as number,
  }));

  const matCost = materialCost(pricedMaterials, input.rrr);
  const fee = stationFee(input.itemValue, input.feePer100Nutrition, input.tier);
  const totalCost = matCost + fee;
  const costPerUnit = totalCost / input.outputAmount;
  const netRevenue = netRevenuePerUnit(input.sellPrice, input.salesTax, input.setupFee);
  const profitPerUnit = profit(costPerUnit, netRevenue);
  const profitPerBatch = profitPerUnit * input.outputAmount;
  const marginPct = costPerUnit ? profitPerUnit / costPerUnit : null;
  const spf = silverPerFocus(profitPerBatch, input.focusCost);

  return {
    materialCost: matCost,
    fee,
    costPerUnit,
    netRevenue,
    profitPerUnit,
    marginPct,
    profitPerBatch,
    silverPerFocus: spf,
    noPriceData: false,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npm run test -- profit`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/calc/profit.ts app/src/calc/__tests__/profit.test.ts
git commit -m "feat(app/calc): craftProfit integration with master-prompt acceptance tests

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 18: src/data/types.ts + loadRecipes.ts

**Files:**
- Create: `app/src/data/types.ts`
- Create: `app/src/data/loadRecipes.ts`
- Test: `app/src/data/__tests__/loadRecipes.test.ts`

**Interfaces:**
- Produces: `Recipe`, `RawRecipeRow`, `RecipeMaterial` types; `fromRawRecipeRow(raw: RawRecipeRow): Recipe`; `loadRecipes(url?: string): Promise<Recipe[]>`. `Recipe` fields (camelCase): `itemId, name, tier, enchant, category, shopCategory, shopSubCategory, outputAmount, itemValue, itemValueIsEstimate, focusCost, materials`. This is the shape every later app task (Dashboard, PriceRefreshBar) consumes — never pass `RawRecipeRow` (snake_case) beyond this module.

- [ ] **Step 1: Write the failing test**

`app/src/data/__tests__/loadRecipes.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm run test -- loadRecipes`
Expected: FAIL — cannot find module `../loadRecipes`

- [ ] **Step 3: Write the implementation**

`app/src/data/types.ts`:
```ts
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
  };
}
```

`app/src/data/loadRecipes.ts`:
```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm run test -- loadRecipes`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/data/types.ts app/src/data/loadRecipes.ts app/src/data/__tests__/loadRecipes.test.ts
git commit -m "feat(app/data): recipe types and loader

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 19: data/city_specializations.json + citySpecializations.ts

**Files:**
- Create: `app/src/data/city_specializations.json`
- Create: `app/src/data/citySpecializations.ts`
- Test: `app/src/data/__tests__/citySpecializations.test.ts`

**Interfaces:**
- Produces: `craftingSpecCity(recipe: { category: string; shopCategory: string; shopSubCategory: string }): string | null`, `refiningSpecCity(recipe: { category: string; itemId: string }): string | null`. Both are consumed by `Dashboard.tsx` in Task 26.

- [ ] **Step 1: Write the failing test**

`app/src/data/__tests__/citySpecializations.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { craftingSpecCity, refiningSpecCity } from '../citySpecializations';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm run test -- citySpecializations`
Expected: FAIL — cannot find module `../citySpecializations`

- [ ] **Step 3: Write the data file and implementation**

`app/src/data/city_specializations.json` (derived directly from the `@shopsubcategory1`/`@shopcategory` fields observed in `ao-bin-dumps/items.json`, verified 2026-08-17; cross-checked against the Albion Online Wiki resource-return-rate page):
```json
{
  "lastVerified": "2026-08-17",
  "sourceNote": "Derived from @shopsubcategory1/@shopcategory fields in ao-bin-dumps items.json, cross-checked against wiki.albiononline.com/wiki/Resource_return_rate.",
  "craftingBySubcategory": {
    "hammer": "Fort Sterling",
    "spear": "Fort Sterling",
    "holystaff": "Fort Sterling",
    "plate_helmet": "Fort Sterling",
    "cloth_armor": "Fort Sterling",
    "bow": "Lymhurst",
    "sword": "Lymhurst",
    "arcanestaff": "Lymhurst",
    "leather_helmet": "Lymhurst",
    "leather_shoes": "Lymhurst",
    "crossbow": "Bridgewatch",
    "dagger": "Bridgewatch",
    "cursestaff": "Bridgewatch",
    "plate_armor": "Bridgewatch",
    "cloth_shoes": "Bridgewatch",
    "axe": "Martlock",
    "quarterstaff": "Martlock",
    "froststaff": "Martlock",
    "plate_shoes": "Martlock",
    "booktype": "Martlock",
    "shieldtype": "Martlock",
    "torchtype": "Martlock",
    "horntype": "Martlock",
    "mace": "Thetford",
    "firestaff": "Thetford",
    "naturestaff": "Thetford",
    "leather_armor": "Thetford",
    "cloth_helmet": "Thetford",
    "knuckles": "Caerleon",
    "food": "Caerleon",
    "potions": "Brecilien",
    "bags": "Brecilien",
    "satchels": "Brecilien"
  },
  "craftingByShopCategory": {
    "gathering": "Caerleon"
  },
  "craftingCapesPrefix": {
    "accessoires_capes_": "Brecilien"
  },
  "refiningByIdSubstring": {
    "PLANKS": "Fort Sterling",
    "CLOTH": "Lymhurst",
    "STONEBLOCK": "Bridgewatch",
    "LEATHER": "Martlock",
    "METALBAR": "Thetford"
  }
}
```

`app/src/data/citySpecializations.ts`:
```ts
import citySpecData from './city_specializations.json';

export interface CitySpecializationData {
  craftingBySubcategory: Record<string, string>;
  craftingByShopCategory: Record<string, string>;
  craftingCapesPrefix: Record<string, string>;
  refiningByIdSubstring: Record<string, string>;
}

const DATA = citySpecData as unknown as CitySpecializationData;

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm run test -- citySpecializations`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/data/city_specializations.json app/src/data/citySpecializations.ts app/src/data/__tests__/citySpecializations.test.ts
git commit -m "feat(app/data): city specialization lookup grounded in real item data

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 20: src/data/aodpClient.ts

**Files:**
- Create: `app/src/data/aodpClient.ts`
- Test: `app/src/data/__tests__/aodpClient.test.ts`

**Interfaces:**
- Produces: `PriceQuote` interface (`itemId, city, sellPriceMin, sellPriceMinDate, buyPriceMax, buyPriceMaxDate`), `fetchPrices(options: FetchPricesOptions): Promise<PriceQuote[]>`. `FetchPricesOptions`: `{ itemIds: string[]; cities: string[]; quality?: number; batchDelayMs?: number; onProgress?: (done: number, total: number) => void }`. Consumed by `PriceRefreshBar.tsx` in Task 25.

- [ ] **Step 1: Write the failing tests**

`app/src/data/__tests__/aodpClient.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchPrices } from '../aodpClient';

afterEach(() => {
  vi.unstubAllGlobals();
});

function rawEntry(itemId: string, city: string) {
  return {
    item_id: itemId,
    city,
    sell_price_min: 600,
    sell_price_min_date: '2026-08-17T10:00:00',
    buy_price_max: 550,
    buy_price_max_date: '2026-08-17T09:00:00',
  };
}

describe('fetchPrices', () => {
  it('maps a single small batch to typed PriceQuote objects', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([rawEntry('T4_CLOTH', 'Caerleon')]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const prices = await fetchPrices({ itemIds: ['T4_CLOTH'], cities: ['Caerleon'], batchDelayMs: 0 });

    expect(prices).toEqual([
      {
        itemId: 'T4_CLOTH',
        city: 'Caerleon',
        sellPriceMin: 600,
        sellPriceMinDate: '2026-08-17T10:00:00',
        buyPriceMax: 550,
        buyPriceMaxDate: '2026-08-17T09:00:00',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('T4_CLOTH');
    expect(calledUrl).toContain('locations=Caerleon');
  });

  it('splits more than 100 ids into multiple batches and reports progress', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    vi.stubGlobal('fetch', fetchMock);
    const itemIds = Array.from({ length: 150 }, (_, i) => `T4_ITEM_${i}`);
    const progressCalls: [number, number][] = [];

    await fetchPrices({
      itemIds,
      cities: ['Caerleon'],
      batchDelayMs: 0,
      onProgress: (done, total) => progressCalls.push([done, total]),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(progressCalls).toEqual([[1, 2], [2, 2]]);
  });

  it('URL-encodes @ in item ids and spaces in city names', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    vi.stubGlobal('fetch', fetchMock);

    await fetchPrices({ itemIds: ['T4_HEAD_CLOTH_SET1@1'], cities: ['Fort Sterling'], batchDelayMs: 0 });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('T4_HEAD_CLOTH_SET1%401');
    expect(calledUrl).toContain('Fort%20Sterling');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm run test -- aodpClient`
Expected: FAIL — cannot find module `../aodpClient`

- [ ] **Step 3: Write the implementation**

`app/src/data/aodpClient.ts`:
```ts
// Client for the Albion Online Data Project price API. CORS is open
// (access-control-allow-origin: *, verified 2026-08-17), so this runs
// directly in the browser with no backend/proxy.

export interface PriceQuote {
  itemId: string;
  city: string;
  sellPriceMin: number;
  sellPriceMinDate: string;
  buyPriceMax: number;
  buyPriceMaxDate: string;
}

const BASE_URL = 'https://europe.albion-online-data.com/api/v2/stats/prices';
const BATCH_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

interface RawPriceEntry {
  item_id: string;
  city: string;
  sell_price_min: number;
  sell_price_min_date: string;
  buy_price_max: number;
  buy_price_max_date: string;
}

async function fetchBatch(itemIds: string[], cities: string[], quality: number): Promise<PriceQuote[]> {
  const idsParam = itemIds.map((id) => encodeURIComponent(id)).join(',');
  const citiesParam = cities.map((c) => encodeURIComponent(c)).join(',');
  const url = `${BASE_URL}/${idsParam}.json?locations=${citiesParam}&qualities=${quality}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Price fetch failed: HTTP ${response.status}`);
  }
  const raw: RawPriceEntry[] = await response.json();
  return raw.map((r) => ({
    itemId: r.item_id,
    city: r.city,
    sellPriceMin: r.sell_price_min,
    sellPriceMinDate: r.sell_price_min_date,
    buyPriceMax: r.buy_price_max,
    buyPriceMaxDate: r.buy_price_max_date,
  }));
}

export interface FetchPricesOptions {
  itemIds: string[];
  cities: string[];
  quality?: number;
  batchDelayMs?: number;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Fetches prices for many items across the given cities, batching requests
 * at BATCH_SIZE ids per call with a small delay between batches to be
 * gentle on the shared community API.
 */
export async function fetchPrices({
  itemIds,
  cities,
  quality = 1,
  batchDelayMs = 200,
  onProgress,
}: FetchPricesOptions): Promise<PriceQuote[]> {
  const batches = chunk(itemIds, BATCH_SIZE);
  const results: PriceQuote[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batchResults = await fetchBatch(batches[i], cities, quality);
    results.push(...batchResults);
    onProgress?.(i + 1, batches.length);
    if (i < batches.length - 1 && batchDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, batchDelayMs));
    }
  }

  return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npm run test -- aodpClient`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/data/aodpClient.ts app/src/data/__tests__/aodpClient.test.ts
git commit -m "feat(app/data): batched AODP price client

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 21: src/data/priceCache.ts

**Files:**
- Create: `app/src/data/priceCache.ts`
- Test: `app/src/data/__tests__/priceCache.test.ts`

**Interfaces:**
- Consumes: `PriceQuote` from `./aodpClient` (Task 20).
- Produces: `savePrices(quotes: PriceQuote[], now?: Date): void`, `getPrice(itemId: string, city: string): PriceQuote | null`, `getPriceAgeHours(itemId: string, city: string, now?: Date): number | null`, `clearPriceCache(): void`. Consumed by `Dashboard.tsx` (Task 26) and `PriceRefreshBar.tsx` (Task 25).

- [ ] **Step 1: Write the failing test**

`app/src/data/__tests__/priceCache.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { savePrices, getPrice, getPriceAgeHours, clearPriceCache } from '../priceCache';
import type { PriceQuote } from '../aodpClient';

const SAMPLE: PriceQuote = {
  itemId: 'T4_CLOTH',
  city: 'Caerleon',
  sellPriceMin: 600,
  sellPriceMinDate: '2026-08-17T10:00:00',
  buyPriceMax: 550,
  buyPriceMaxDate: '2026-08-17T09:00:00',
};

beforeEach(() => {
  clearPriceCache();
});

describe('priceCache', () => {
  it('returns null for an uncached item', () => {
    expect(getPrice('T4_CLOTH', 'Caerleon')).toBeNull();
    expect(getPriceAgeHours('T4_CLOTH', 'Caerleon')).toBeNull();
  });

  it('saves and retrieves a price quote', () => {
    savePrices([SAMPLE], new Date('2026-08-17T12:00:00Z'));
    expect(getPrice('T4_CLOTH', 'Caerleon')).toEqual(SAMPLE);
  });

  it('computes price age in hours', () => {
    savePrices([SAMPLE], new Date('2026-08-17T10:00:00Z'));
    const age = getPriceAgeHours('T4_CLOTH', 'Caerleon', new Date('2026-08-17T13:30:00Z'));
    expect(age).toBeCloseTo(3.5, 5);
  });

  it('keeps separate entries per city', () => {
    savePrices([SAMPLE, { ...SAMPLE, city: 'Martlock', sellPriceMin: 700 }], new Date('2026-08-17T12:00:00Z'));
    expect(getPrice('T4_CLOTH', 'Caerleon')?.sellPriceMin).toBe(600);
    expect(getPrice('T4_CLOTH', 'Martlock')?.sellPriceMin).toBe(700);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm run test -- priceCache`
Expected: FAIL — cannot find module `../priceCache`

- [ ] **Step 3: Write the implementation**

`app/src/data/priceCache.ts`:
```ts
// Caches AODP price quotes in localStorage with a timestamp, so the
// Dashboard can show price age and avoid refetching on every reload.

import type { PriceQuote } from './aodpClient';

const STORAGE_KEY = 'albion-crafting-tool:price-cache:v1';

interface CacheEntry {
  quote: PriceQuote;
  fetchedAt: string; // ISO timestamp
}

type CacheShape = Record<string, CacheEntry>; // key: `${itemId}|${city}`

function cacheKey(itemId: string, city: string): string {
  return `${itemId}|${city}`;
}

function readCache(): CacheShape {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as CacheShape;
  } catch {
    return {};
  }
}

function writeCache(cache: CacheShape): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
}

export function savePrices(quotes: PriceQuote[], now: Date = new Date()): void {
  const cache = readCache();
  for (const quote of quotes) {
    cache[cacheKey(quote.itemId, quote.city)] = { quote, fetchedAt: now.toISOString() };
  }
  writeCache(cache);
}

export function getPrice(itemId: string, city: string): PriceQuote | null {
  const cache = readCache();
  return cache[cacheKey(itemId, city)]?.quote ?? null;
}

/** Age of a cached price in hours, or null if not cached. */
export function getPriceAgeHours(itemId: string, city: string, now: Date = new Date()): number | null {
  const cache = readCache();
  const entry = cache[cacheKey(itemId, city)];
  if (!entry) return null;
  const fetchedAt = new Date(entry.fetchedAt).getTime();
  return (now.getTime() - fetchedAt) / (1000 * 60 * 60);
}

export function clearPriceCache(): void {
  localStorage.removeItem(STORAGE_KEY);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm run test -- priceCache`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/data/priceCache.ts app/src/data/__tests__/priceCache.test.ts
git commit -m "feat(app/data): localStorage price cache with age tracking

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 22: src/state/ConfigContext.tsx

**Files:**
- Create: `app/src/state/ConfigContext.tsx`
- Test: `app/src/state/__tests__/ConfigContext.test.tsx`

**Interfaces:**
- Produces: `CalcConfig` interface (`buyCity, sellCity, buyMode: TradeMode, sellMode: TradeMode, premium, useFocus, dailyBonus: 0|0.1|0.2, hideoutBonusPct, feePer100Nutrition, quality`), `CITIES` (8 city names), `BASE_CITY_BONUS = 0.18`, `DEFAULT_CONFIG`, `ConfigProvider`, `useConfig()`. Consumed by every component from Task 23 onward.

- [ ] **Step 1: Write the failing test**

`app/src/state/__tests__/ConfigContext.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfigProvider, useConfig, DEFAULT_CONFIG } from '../ConfigContext';

function Probe() {
  const { config, setConfig } = useConfig();
  return (
    <div>
      <span data-testid="buy-city">{config.buyCity}</span>
      <button onClick={() => setConfig({ ...config, buyCity: 'Martlock' })}>change</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('ConfigProvider', () => {
  it('provides the default config when nothing is stored', () => {
    render(
      <ConfigProvider>
        <Probe />
      </ConfigProvider>
    );
    expect(screen.getByTestId('buy-city')).toHaveTextContent(DEFAULT_CONFIG.buyCity);
  });

  it('persists config changes to localStorage', () => {
    render(
      <ConfigProvider>
        <Probe />
      </ConfigProvider>
    );
    fireEvent.click(screen.getByText('change'));
    expect(screen.getByTestId('buy-city')).toHaveTextContent('Martlock');
    const stored = JSON.parse(localStorage.getItem('albion-crafting-tool:config:v1')!);
    expect(stored.buyCity).toBe('Martlock');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm run test -- ConfigContext`
Expected: FAIL — cannot find module `../ConfigContext`

- [ ] **Step 3: Write the implementation**

`app/src/state/ConfigContext.tsx`:
```tsx
import React, { createContext, useContext, useEffect, useState } from 'react';

export type TradeMode = 'instant' | 'order';

export interface CalcConfig {
  buyCity: string;
  sellCity: string;
  buyMode: TradeMode;
  sellMode: TradeMode;
  premium: boolean;
  useFocus: boolean;
  dailyBonus: 0 | 0.1 | 0.2;
  hideoutBonusPct: number;
  feePer100Nutrition: number;
  quality: number;
}

export const CITIES = [
  'Caerleon',
  'Bridgewatch',
  'Lymhurst',
  'Martlock',
  'Thetford',
  'Fort Sterling',
  'Brecilien',
  'Black Market',
] as const;

export const BASE_CITY_BONUS = 0.18;

export const DEFAULT_CONFIG: CalcConfig = {
  buyCity: 'Caerleon',
  sellCity: 'Caerleon',
  buyMode: 'instant',
  sellMode: 'order',
  premium: true,
  useFocus: true,
  dailyBonus: 0,
  hideoutBonusPct: 0,
  feePer100Nutrition: 150,
  quality: 1,
};

const STORAGE_KEY = 'albion-crafting-tool:config:v1';

interface ConfigContextValue {
  config: CalcConfig;
  setConfig: (config: CalcConfig) => void;
}

const ConfigContext = createContext<ConfigContextValue | undefined>(undefined);

function loadStoredConfig(): CalcConfig {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_CONFIG;
  try {
    return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<CalcConfig>) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<CalcConfig>(loadStoredConfig);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  return <ConfigContext.Provider value={{ config, setConfig }}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigContextValue {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useConfig must be used within a ConfigProvider');
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm run test -- ConfigContext`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/state/ConfigContext.tsx app/src/state/__tests__/ConfigContext.test.tsx
git commit -m "feat(app/state): config context with localStorage persistence

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 23: src/components/ConfigPanel.tsx

**Files:**
- Create: `app/src/components/ConfigPanel.tsx`
- Test: `app/src/components/__tests__/ConfigPanel.test.tsx`

**Interfaces:**
- Consumes: `useConfig`, `CITIES`, `CalcConfig`, `TradeMode` from `../state/ConfigContext` (Task 22).
- Produces: `ConfigPanel` component (no props — reads/writes via `useConfig`).

- [ ] **Step 1: Write the failing test**

`app/src/components/__tests__/ConfigPanel.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfigProvider, useConfig } from '../../state/ConfigContext';
import { ConfigPanel } from '../ConfigPanel';

function ReadBuyCity() {
  const { config } = useConfig();
  return <span data-testid="buy-city-value">{config.buyCity}</span>;
}

function Wrapper() {
  return (
    <ConfigProvider>
      <ConfigPanel />
      <ReadBuyCity />
    </ConfigProvider>
  );
}

describe('ConfigPanel', () => {
  it('updates buy city in config state when changed', () => {
    render(<Wrapper />);
    fireEvent.change(screen.getByLabelText('Kauf-Stadt'), { target: { value: 'Martlock' } });
    expect(screen.getByTestId('buy-city-value')).toHaveTextContent('Martlock');
  });

  it('toggles the premium checkbox', () => {
    render(<Wrapper />);
    const checkbox = screen.getByLabelText('Premium') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm run test -- ConfigPanel`
Expected: FAIL — cannot find module `../ConfigPanel`

- [ ] **Step 3: Write the implementation**

`app/src/components/ConfigPanel.tsx`:
```tsx
import React from 'react';
import { useConfig, CITIES, CalcConfig, TradeMode } from '../state/ConfigContext';

export function ConfigPanel() {
  const { config, setConfig } = useConfig();

  function update<K extends keyof CalcConfig>(key: K, value: CalcConfig[K]) {
    setConfig({ ...config, [key]: value });
  }

  return (
    <section className="config-panel" aria-label="Konfiguration">
      <h2>Konfiguration</h2>

      <label>
        Kauf-Stadt
        <select value={config.buyCity} onChange={(e) => update('buyCity', e.target.value)}>
          {CITIES.map((city) => (
            <option key={city} value={city}>{city}</option>
          ))}
        </select>
      </label>

      <label>
        Verkaufs-Stadt
        <select value={config.sellCity} onChange={(e) => update('sellCity', e.target.value)}>
          {CITIES.map((city) => (
            <option key={city} value={city}>{city}</option>
          ))}
        </select>
      </label>

      <label>
        Kauf-Modus
        <select value={config.buyMode} onChange={(e) => update('buyMode', e.target.value as TradeMode)}>
          <option value="instant">Instant</option>
          <option value="order">Order</option>
        </select>
      </label>

      <label>
        Verkaufs-Modus
        <select value={config.sellMode} onChange={(e) => update('sellMode', e.target.value as TradeMode)}>
          <option value="instant">Instant</option>
          <option value="order">Order</option>
        </select>
      </label>

      <label>
        <input type="checkbox" checked={config.premium} onChange={(e) => update('premium', e.target.checked)} />
        Premium
      </label>

      <label>
        <input type="checkbox" checked={config.useFocus} onChange={(e) => update('useFocus', e.target.checked)} />
        Fokus nutzen
      </label>

      <label>
        Daily Bonus
        <select
          value={config.dailyBonus}
          onChange={(e) => update('dailyBonus', Number(e.target.value) as CalcConfig['dailyBonus'])}
        >
          <option value={0}>Keiner</option>
          <option value={0.1}>+10% (Silver Day)</option>
          <option value={0.2}>+20% (Gold Day)</option>
        </select>
      </label>

      <label>
        Hideout/Guild-Bonus (%)
        <input
          type="number"
          step="1"
          value={config.hideoutBonusPct * 100}
          onChange={(e) => update('hideoutBonusPct', Number(e.target.value) / 100)}
        />
      </label>

      <label>
        Stationsgebühr / 100 Nutrition
        <input
          type="number"
          value={config.feePer100Nutrition}
          onChange={(e) => update('feePer100Nutrition', Number(e.target.value))}
        />
      </label>

      <label>
        Qualität
        <input
          type="number"
          min={1}
          max={5}
          value={config.quality}
          onChange={(e) => update('quality', Number(e.target.value))}
        />
      </label>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm run test -- ConfigPanel`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/components/ConfigPanel.tsx app/src/components/__tests__/ConfigPanel.test.tsx
git commit -m "feat(app/components): ConfigPanel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 24: src/components/FilterSortControls.tsx

**Files:**
- Create: `app/src/components/FilterSortControls.tsx`
- Test: `app/src/components/__tests__/FilterSortControls.test.tsx`

**Interfaces:**
- Produces: `SortKey = 'profitPerUnit' | 'silverPerFocus'`, `Filters` interface (`category, tier, enchant, onlyProfitable, sortKey`), `DEFAULT_FILTERS`, `FilterSortControls({ filters, onChange })` component. Consumed by `App.tsx` (Task 27) and `Dashboard.tsx` (Task 26).

- [ ] **Step 1: Write the failing test**

`app/src/components/__tests__/FilterSortControls.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterSortControls, DEFAULT_FILTERS } from '../FilterSortControls';

describe('FilterSortControls', () => {
  it('calls onChange with the updated category', () => {
    const onChange = vi.fn();
    render(<FilterSortControls filters={DEFAULT_FILTERS} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Kategorie'), { target: { value: 'weapon' } });
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, category: 'weapon' });
  });

  it('calls onChange with the updated sort key', () => {
    const onChange = vi.fn();
    render(<FilterSortControls filters={DEFAULT_FILTERS} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Sortieren nach'), { target: { value: 'silverPerFocus' } });
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, sortKey: 'silverPerFocus' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm run test -- FilterSortControls`
Expected: FAIL — cannot find module `../FilterSortControls`

- [ ] **Step 3: Write the implementation**

`app/src/components/FilterSortControls.tsx`:
```tsx
import React from 'react';

export type SortKey = 'profitPerUnit' | 'silverPerFocus';

export interface Filters {
  category: string;
  tier: number | '';
  enchant: number | '';
  onlyProfitable: boolean;
  sortKey: SortKey;
}

export const DEFAULT_FILTERS: Filters = {
  category: '',
  tier: '',
  enchant: '',
  onlyProfitable: false,
  sortKey: 'profitPerUnit',
};

const CATEGORIES = ['simpleitem', 'equipmentitem', 'weapon', 'consumableitem', 'mount'];

export function FilterSortControls({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
}) {
  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <section className="filter-sort-controls" aria-label="Filter & Sortierung">
      <label>
        Kategorie
        <select value={filters.category} onChange={(e) => update('category', e.target.value)}>
          <option value="">Alle</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
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

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm run test -- FilterSortControls`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/components/FilterSortControls.tsx app/src/components/__tests__/FilterSortControls.test.tsx
git commit -m "feat(app/components): FilterSortControls

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 25: src/components/PriceRefreshBar.tsx

**Files:**
- Create: `app/src/components/PriceRefreshBar.tsx`
- Test: `app/src/components/__tests__/PriceRefreshBar.test.tsx`

**Interfaces:**
- Consumes: `fetchPrices` from `../data/aodpClient` (Task 20), `savePrices` from `../data/priceCache` (Task 21), `Recipe` from `../data/types` (Task 18), `CalcConfig` from `../state/ConfigContext` (Task 22).
- Produces: `PriceRefreshBar({ visibleRecipes, allRecipes, config, onDone })` component. Consumed by `App.tsx` (Task 27).

- [ ] **Step 1: Write the failing tests**

`app/src/components/__tests__/PriceRefreshBar.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PriceRefreshBar } from '../PriceRefreshBar';
import * as aodpClient from '../../data/aodpClient';
import * as priceCache from '../../data/priceCache';
import { DEFAULT_CONFIG } from '../../state/ConfigContext';
import type { Recipe } from '../../data/types';

const RECIPE: Recipe = {
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
  materials: [{ id: 'T4_FIBER', count: 2 }],
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('PriceRefreshBar', () => {
  it('fetches prices for the visible recipes and their materials, then saves and calls onDone', async () => {
    const fetchSpy = vi.spyOn(aodpClient, 'fetchPrices').mockResolvedValue([]);
    const saveSpy = vi.spyOn(priceCache, 'savePrices').mockImplementation(() => {});
    const onDone = vi.fn();

    render(
      <PriceRefreshBar visibleRecipes={[RECIPE]} allRecipes={[RECIPE]} config={DEFAULT_CONFIG} onDone={onDone} />
    );

    fireEvent.click(screen.getByText('Preise aktualisieren (gefilterte Ansicht)'));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ itemIds: expect.arrayContaining(['T4_CLOTH', 'T4_FIBER']) })
    );
    expect(saveSpy).toHaveBeenCalled();
  });

  it('shows an error message when the fetch fails', async () => {
    vi.spyOn(aodpClient, 'fetchPrices').mockRejectedValue(new Error('network down'));

    render(
      <PriceRefreshBar visibleRecipes={[RECIPE]} allRecipes={[RECIPE]} config={DEFAULT_CONFIG} onDone={vi.fn()} />
    );

    fireEvent.click(screen.getByText('Preise aktualisieren (gefilterte Ansicht)'));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('network down'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm run test -- PriceRefreshBar`
Expected: FAIL — cannot find module `../PriceRefreshBar`

- [ ] **Step 3: Write the implementation**

`app/src/components/PriceRefreshBar.tsx`:
```tsx
import React, { useState } from 'react';
import { fetchPrices } from '../data/aodpClient';
import { savePrices } from '../data/priceCache';
import type { Recipe } from '../data/types';
import type { CalcConfig } from '../state/ConfigContext';

interface PriceRefreshBarProps {
  visibleRecipes: Recipe[];
  allRecipes: Recipe[];
  config: CalcConfig;
  onDone: () => void;
}

function collectItemIds(recipes: Recipe[]): string[] {
  const ids = new Set<string>();
  for (const recipe of recipes) {
    ids.add(recipe.itemId);
    for (const material of recipe.materials) {
      ids.add(material.id);
    }
  }
  return Array.from(ids);
}

export function PriceRefreshBar({ visibleRecipes, allRecipes, config, onDone }: PriceRefreshBarProps) {
  // isRefreshing is set synchronously at the top of refresh(), before the
  // first `await` — unlike `progress`, which only updates once fetchPrices'
  // onProgress callback fires after a network round-trip. Using `progress`
  // alone for the disabled state leaves a window (click -> first network
  // response) where both buttons stay enabled and a fast double-click
  // starts two concurrent refreshes.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh(recipes: Recipe[]) {
    setError(null);
    setIsRefreshing(true);
    // itemIds/cities are computed inside the try, not before it: if either
    // throws (e.g. malformed recipe data), the exception must still reach
    // catch/finally so isRefreshing gets reset -- otherwise both buttons
    // get stuck permanently disabled with no error shown.
    try {
      const itemIds = collectItemIds(recipes);
      const cities = Array.from(new Set([config.buyCity, config.sellCity]));
      const quotes = await fetchPrices({
        itemIds,
        cities,
        quality: config.quality,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      savePrices(quotes);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler beim Preis-Refresh');
    } finally {
      setProgress(null);
      setIsRefreshing(false);
    }
  }

  return (
    <div className="price-refresh-bar">
      <button onClick={() => refresh(visibleRecipes)} disabled={isRefreshing}>
        Preise aktualisieren (gefilterte Ansicht)
      </button>
      <button onClick={() => refresh(allRecipes)} disabled={isRefreshing}>
        Alle laden
      </button>
      {progress && (
        <span role="status">Lade Batch {progress.done} / {progress.total}…</span>
      )}
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npm run test -- PriceRefreshBar`
Expected: PASS (2 tests)

- [ ] **Step 4b: Regression test for the double-submit race (found during Task 25 review)**

Add a third test asserting the disabled state flips synchronously on click, before the mocked `fetchPrices` promise resolves (e.g. via a controllable/never-resolving promise), so a fast double-click cannot start two concurrent refreshes. Re-run `npm run test -- PriceRefreshBar` — expect PASS (3 tests).

- [ ] **Step 4c: Regression test for the stuck-disabled edge case (found during Task 25 re-review)**

Moving `itemIds`/`cities` computation inside the `try` (already reflected in Step 3's code above) closes a second bug: if that computation throws, the exception must still reach `catch`/`finally` so `isRefreshing` resets — otherwise both buttons get stuck permanently disabled with no error shown. Add a fourth test that triggers a throw from within the `try` block (e.g. a recipe whose `materials` field breaks `collectItemIds`'s iteration) and asserts `isRefreshing` resolves back to `false` afterward. Re-run `npm run test -- PriceRefreshBar` — expect PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/components/PriceRefreshBar.tsx app/src/components/__tests__/PriceRefreshBar.test.tsx
git commit -m "feat(app/components): PriceRefreshBar with scoped/full refresh and progress

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 26: src/components/Dashboard.tsx

**Files:**
- Create: `app/src/components/Dashboard.tsx`
- Test: `app/src/components/__tests__/Dashboard.test.tsx`

**Interfaces:**
- Consumes: `craftingSpecCity`, `refiningSpecCity` (Task 19); `getPrice`, `getPriceAgeHours` (Task 21); `resourceReturnRate` (Task 15); `craftProfit`, `CraftProfitResult` (Task 17); `Recipe` (Task 18); `CalcConfig`, `BASE_CITY_BONUS` (Task 22); `Filters` (Task 24).
- Produces: `Dashboard({ recipes, config, filters })` component. Consumed by `App.tsx` (Task 27).

- [ ] **Step 1: Write the failing tests**

`app/src/components/__tests__/Dashboard.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Dashboard } from '../Dashboard';
import { savePrices, clearPriceCache } from '../../data/priceCache';
import { DEFAULT_CONFIG } from '../../state/ConfigContext';
import { DEFAULT_FILTERS } from '../FilterSortControls';
import type { Recipe } from '../../data/types';

const CLOTH_RECIPE: Recipe = {
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
  materials: [
    { id: 'T4_FIBER', count: 2 },
    { id: 'T3_CLOTH', count: 1 },
  ],
};

beforeEach(() => {
  clearPriceCache();
});

describe('Dashboard', () => {
  it('shows NO PRICE DATA when prices are missing', () => {
    render(<Dashboard recipes={[CLOTH_RECIPE]} config={DEFAULT_CONFIG} filters={DEFAULT_FILTERS} />);
    expect(screen.getByText('NO PRICE DATA')).toBeInTheDocument();
  });

  it('computes profit once prices are cached, using the same formulas as the acceptance tests', () => {
    savePrices([
      { itemId: 'T4_FIBER', city: 'Caerleon', sellPriceMin: 200, sellPriceMinDate: '', buyPriceMax: 0, buyPriceMaxDate: '' },
      { itemId: 'T3_CLOTH', city: 'Caerleon', sellPriceMin: 150, sellPriceMinDate: '', buyPriceMax: 0, buyPriceMaxDate: '' },
      { itemId: 'T4_CLOTH', city: 'Caerleon', sellPriceMin: 600, sellPriceMinDate: '', buyPriceMax: 0, buyPriceMaxDate: '' },
    ]);

    render(<Dashboard recipes={[CLOTH_RECIPE]} config={DEFAULT_CONFIG} filters={DEFAULT_FILTERS} />);

    // NOTE: this is 247.57, not the master-prompt doc's 247.55 — the doc's
    // worked example manually rounded RRR to 4dp before multiplying through
    // the materials sum (see calc_reference.py's SHARED_RRR comment in Task
    // 6). The Dashboard, like resourceReturnRate() itself, intentionally
    // keeps full float precision for real money math, so it lands 0.02
    // silver away from the hand-rounded documentation example — both are
    // "correct" for what they're each doing.
    // getAllByText (not getByText): with CLOTH_RECIPE.outputAmount === 1,
    // profitPerUnit and profitPerBatch are numerically identical, so
    // "247.57" legitimately appears in two different cells (Profit/Einheit
    // and Profit/Craft) — that's two distinct computed fields sharing a
    // value for this fixture, not a rendering bug.
    expect(screen.getAllByText('247.57').length).toBeGreaterThan(0);
  });

  it('applies the refining specialization bonus when buyCity matches (higher RRR -> lower material cost)', () => {
    savePrices([
      { itemId: 'T4_FIBER', city: 'Lymhurst', sellPriceMin: 200, sellPriceMinDate: '', buyPriceMax: 0, buyPriceMaxDate: '' },
      { itemId: 'T3_CLOTH', city: 'Lymhurst', sellPriceMin: 150, sellPriceMinDate: '', buyPriceMax: 0, buyPriceMaxDate: '' },
      { itemId: 'T4_CLOTH', city: 'Caerleon', sellPriceMin: 600, sellPriceMinDate: '', buyPriceMax: 0, buyPriceMaxDate: '' },
    ]);
    const configWithLymhurstBuy = { ...DEFAULT_CONFIG, buyCity: 'Lymhurst' };

    render(<Dashboard recipes={[CLOTH_RECIPE]} config={configWithLymhurstBuy} filters={DEFAULT_FILTERS} />);

    // Lymhurst is T4_CLOTH's refining spec city (city_specializations.json)
    // -> specBonus 0.40. bonus = 0.18+0.40+0.59 = 1.17, RRR = 1.17/2.17 ≈
    // 0.53917. materialCost = 550*(1-0.53917) ≈ 253.46 — visibly lower than
    // the 310.75/310.73 seen in the zero-bonus test above, proving the spec
    // bonus is actually applied (not hardcoded to 0).
    expect(screen.getByText('253.46')).toBeInTheDocument();
  });

  it('marks estimated item values (e.g. potions/food) so the fee is understood as approximate', () => {
    const estimatedRecipe: Recipe = { ...CLOTH_RECIPE, itemId: 'T4_POTION_HEAL', name: 'Heiltrank', itemValueIsEstimate: true };
    savePrices([
      { itemId: 'T4_FIBER', city: 'Caerleon', sellPriceMin: 200, sellPriceMinDate: '', buyPriceMax: 0, buyPriceMaxDate: '' },
      { itemId: 'T3_CLOTH', city: 'Caerleon', sellPriceMin: 150, sellPriceMinDate: '', buyPriceMax: 0, buyPriceMaxDate: '' },
      { itemId: 'T4_POTION_HEAL', city: 'Caerleon', sellPriceMin: 600, sellPriceMinDate: '', buyPriceMax: 0, buyPriceMaxDate: '' },
    ]);

    render(<Dashboard recipes={[estimatedRecipe]} config={DEFAULT_CONFIG} filters={DEFAULT_FILTERS} />);

    expect(screen.getByTitle('Item-Value geschätzt (Summe der Zutaten) — Gebühr ist approximativ')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm run test -- Dashboard`
Expected: FAIL — cannot find module `../Dashboard`

- [ ] **Step 3: Write the implementation**

`app/src/components/Dashboard.tsx`:
```tsx
import React, { useMemo } from 'react';
import type { Recipe } from '../data/types';
import type { CalcConfig } from '../state/ConfigContext';
import { BASE_CITY_BONUS } from '../state/ConfigContext';
import { craftingSpecCity, refiningSpecCity } from '../data/citySpecializations';
import { getPrice, getPriceAgeHours } from '../data/priceCache';
import { resourceReturnRate } from '../calc/returnRate';
import { craftProfit, CraftProfitResult } from '../calc/profit';
import type { Filters } from './FilterSortControls';

interface DashboardRow {
  recipe: Recipe;
  result: CraftProfitResult;
  priceAgeHours: number | null;
  sellPrice: number | null;
}

function buildRow(recipe: Recipe, config: CalcConfig): DashboardRow {
  const specCity = recipe.category === 'simpleitem' ? refiningSpecCity(recipe) : craftingSpecCity(recipe);
  const specBonus = specCity && specCity === config.buyCity ? (recipe.category === 'simpleitem' ? 0.4 : 0.15) : 0;

  const rrr = resourceReturnRate({
    baseCityBonus: BASE_CITY_BONUS,
    specBonus,
    dailyBonus: config.dailyBonus,
    hideoutBonus: config.hideoutBonusPct,
    useFocus: config.useFocus,
  });

  const materialsWithPrices = recipe.materials.map((m) => {
    const quote = getPrice(m.id, config.buyCity);
    const price = config.buyMode === 'instant' ? quote?.sellPriceMin : quote?.buyPriceMax;
    return { id: m.id, count: m.count, price: price ?? null };
  });

  const sellQuote = getPrice(recipe.itemId, config.sellCity);
  const sellPrice = config.sellMode === 'order' ? sellQuote?.sellPriceMin : sellQuote?.buyPriceMax;

  const salesTax = config.premium ? 0.04 : 0.08;
  const setupFee = config.sellMode === 'order' ? 0.025 : 0;

  const result = craftProfit({
    materials: materialsWithPrices,
    outputAmount: recipe.outputAmount,
    itemValue: recipe.itemValue,
    focusCost: recipe.focusCost,
    tier: recipe.tier,
    sellPrice: sellPrice ?? null,
    rrr,
    feePer100Nutrition: config.feePer100Nutrition,
    salesTax,
    setupFee,
  });

  const priceAgeHours = getPriceAgeHours(recipe.itemId, config.sellCity);

  return { recipe, result, priceAgeHours, sellPrice: sellPrice ?? null };
}

function applyFilters(rows: DashboardRow[], filters: Filters): DashboardRow[] {
  return rows.filter((row) => {
    if (filters.category && row.recipe.category !== filters.category) return false;
    if (filters.tier !== '' && row.recipe.tier !== filters.tier) return false;
    if (filters.enchant !== '' && row.recipe.enchant !== filters.enchant) return false;
    if (filters.onlyProfitable) {
      if (row.result.noPriceData) return false;
      if ((row.result.profitPerUnit ?? 0) <= 0) return false;
    }
    return true;
  });
}

function sortRows(rows: DashboardRow[], sortKey: Filters['sortKey']): DashboardRow[] {
  return [...rows].sort((a, b) => {
    if (a.result.noPriceData && b.result.noPriceData) return 0;
    if (a.result.noPriceData) return 1;
    if (b.result.noPriceData) return -1;
    const aVal = sortKey === 'profitPerUnit' ? a.result.profitPerUnit! : a.result.silverPerFocus ?? -Infinity;
    const bVal = sortKey === 'profitPerUnit' ? b.result.profitPerUnit! : b.result.silverPerFocus ?? -Infinity;
    return bVal - aVal;
  });
}

export function Dashboard({ recipes, config, filters }: { recipes: Recipe[]; config: CalcConfig; filters: Filters }) {
  const rows = useMemo(() => {
    const built = recipes.map((r) => buildRow(r, config));
    const filtered = applyFilters(built, filters);
    return sortRows(filtered, filters.sortKey);
  }, [recipes, config, filters]);

  return (
    <table className="dashboard-table">
      <thead>
        <tr>
          <th>Item</th>
          <th>Tier</th>
          <th>Enchant</th>
          <th>Materialkosten</th>
          <th>Stationsgebühr</th>
          <th>Kosten/Einheit</th>
          <th>Verkaufspreis</th>
          <th>Nettoerlös/Einheit</th>
          <th>Profit/Einheit</th>
          <th>Marge %</th>
          <th>Profit/Craft</th>
          <th>Fokuskosten</th>
          <th>Silber/Fokus</th>
          <th>Preis-Alter (h)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={`${row.recipe.itemId}.${row.recipe.enchant}`}
            className={row.result.noPriceData ? 'row-no-price-data' : (row.result.profitPerUnit ?? 0) > 0 ? 'row-profit' : 'row-loss'}
          >
            <td>
              {row.recipe.name}
              {row.recipe.itemValueIsEstimate && (
                <span title="Item-Value geschätzt (Summe der Zutaten) — Gebühr ist approximativ"> *</span>
              )}
            </td>
            <td>{row.recipe.tier}</td>
            <td>{row.recipe.enchant}</td>
            {row.result.noPriceData ? (
              <td colSpan={11}>NO PRICE DATA</td>
            ) : (
              <>
                <td>{row.result.materialCost!.toFixed(2)}</td>
                <td>{row.result.fee!.toFixed(2)}</td>
                <td>{row.result.costPerUnit!.toFixed(2)}</td>
                <td>{row.sellPrice !== null ? row.sellPrice.toFixed(2) : '—'}</td>
                <td>{row.result.netRevenue!.toFixed(2)}</td>
                <td>{row.result.profitPerUnit!.toFixed(2)}</td>
                <td>{(row.result.marginPct! * 100).toFixed(1)}%</td>
                <td>{row.result.profitPerBatch!.toFixed(2)}</td>
                <td>{row.recipe.focusCost.toFixed(0)}</td>
                <td>{row.result.silverPerFocus?.toFixed(3) ?? '—'}</td>
                <td>{row.priceAgeHours !== null ? row.priceAgeHours.toFixed(1) : '—'}</td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npm run test -- Dashboard`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/components/Dashboard.tsx app/src/components/__tests__/Dashboard.test.tsx
git commit -m "feat(app/components): Dashboard integrating calc, prices and city specialization

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 27: src/App.tsx + main.tsx + App.css — wire everything together

**Files:**
- Create: `app/src/App.tsx`
- Modify: `app/src/main.tsx`
- Create: `app/src/App.css`
- Test: `app/src/__tests__/App.test.tsx`

**Interfaces:**
- Consumes: `ConfigProvider`, `useConfig` (Task 22); `ConfigPanel` (Task 23); `FilterSortControls`, `DEFAULT_FILTERS`, `Filters` (Task 24); `PriceRefreshBar` (Task 25); `Dashboard` (Task 26); `loadRecipes` (Task 18).
- Produces: `App` component, the root of the site.

- [ ] **Step 1: Write the failing test**

`app/src/__tests__/App.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '../App';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('App', () => {
  it('renders the header and config panel after recipes load', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }));
    render(<App />);
    expect(await screen.findByText('Albion Crafting & Market Profit Tool')).toBeInTheDocument();
    expect(screen.getByLabelText('Kauf-Stadt')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm run test -- App.test`
Expected: FAIL — cannot find module `../App`

- [ ] **Step 3: Write the implementation**

`app/src/App.tsx`:
```tsx
import React, { useEffect, useState } from 'react';
import { ConfigProvider, useConfig } from './state/ConfigContext';
import { ConfigPanel } from './components/ConfigPanel';
import { FilterSortControls, DEFAULT_FILTERS, Filters } from './components/FilterSortControls';
import { PriceRefreshBar } from './components/PriceRefreshBar';
import { Dashboard } from './components/Dashboard';
import { loadRecipes } from './data/loadRecipes';
import type { Recipe } from './data/types';
import './App.css';

function AppContent() {
  const { config } = useConfig();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    loadRecipes()
      .then(setRecipes)
      .catch((e) => setError(e instanceof Error ? e.message : 'Rezepte konnten nicht geladen werden'));
  }, []);

  const visibleRecipes = recipes.filter((r) => {
    if (filters.category && r.category !== filters.category) return false;
    if (filters.tier !== '' && r.tier !== filters.tier) return false;
    if (filters.enchant !== '' && r.enchant !== filters.enchant) return false;
    return true;
  });

  return (
    <div className="app-layout">
      <header>
        <h1>Albion Crafting &amp; Market Profit Tool</h1>
      </header>
      {error && <p role="alert">{error}</p>}
      <div className="app-body">
        <aside>
          <ConfigPanel />
        </aside>
        <main>
          <FilterSortControls filters={filters} onChange={setFilters} />
          <PriceRefreshBar
            visibleRecipes={visibleRecipes}
            allRecipes={recipes}
            config={config}
            onDone={() => setRefreshTick((t) => t + 1)}
          />
          <Dashboard key={refreshTick} recipes={recipes} config={config} filters={filters} />
        </main>
      </div>
    </div>
  );
}

export function App() {
  return (
    <ConfigProvider>
      <AppContent />
    </ConfigProvider>
  );
}
```

`app/src/main.tsx` (replace the stub from Task 14):
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './App.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

`app/src/App.css`:
```css
:root {
  --bg: #0f1115;
  --panel-bg: #171a21;
  --border: #2a2e37;
  --text: #e6e8eb;
  --text-dim: #9aa1ac;
  --profit: #2fbf71;
  --loss: #e5484d;
}

@media (prefers-color-scheme: light) {
  :root {
    --bg: #f5f6f8;
    --panel-bg: #ffffff;
    --border: #dde1e6;
    --text: #1a1d21;
    --text-dim: #5c636e;
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}

.app-layout header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border);
}

.app-body {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 1rem;
  padding: 1rem;
}

.config-panel, .filter-sort-controls {
  background: var(--panel-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1rem;
}

.config-panel label, .filter-sort-controls label {
  display: block;
  margin-bottom: 0.75rem;
  font-size: 0.85rem;
  color: var(--text-dim);
}

.config-panel select, .config-panel input,
.filter-sort-controls select {
  display: block;
  width: 100%;
  margin-top: 0.25rem;
  padding: 0.4rem;
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 4px;
}

.dashboard-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
  background: var(--panel-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.dashboard-table th, .dashboard-table td {
  padding: 0.5rem 0.75rem;
  text-align: right;
  border-bottom: 1px solid var(--border);
}

.dashboard-table th:first-child, .dashboard-table td:first-child {
  text-align: left;
}

.row-profit { background: rgba(47, 191, 113, 0.12); }
.row-loss { background: rgba(229, 72, 77, 0.12); }
.row-no-price-data { color: var(--text-dim); font-style: italic; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm run test -- App.test`
Expected: PASS (1 test)

- [ ] **Step 5: Run the full app test suite and build**

Run: `cd app && npm run test && npm run build`
Expected: all tests pass (~50 tests across Tasks 15-27), build succeeds

- [ ] **Step 6: Commit**

```bash
git add app/src/App.tsx app/src/main.tsx app/src/App.css app/src/__tests__/App.test.tsx
git commit -m "feat(app): wire ConfigPanel, filters, price refresh and dashboard into App

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 28: GitHub Pages deployment workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Produces: an automated build+test+deploy pipeline triggered on push to `main`.

- [ ] **Step 1: Write the workflow file**

`.github/workflows/deploy.yml`:
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main, master]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: app/package-lock.json
      - name: Install dependencies
        working-directory: app
        run: npm ci
      - name: Run tests
        working-directory: app
        run: npm run test
      - name: Build
        working-directory: app
        run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: app/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Verify the YAML is well-formed**

Run: `cd app && node -e "require('yaml' in require('module').builtinModules ? 'yaml' : 'js-yaml')" 2>/dev/null; python -c "import yaml,sys; yaml.safe_load(open('../.github/workflows/deploy.yml'))" 2>&1 || echo "Manual review: check indentation matches the block above exactly"

Expected: no parse error (if no YAML parser is available locally, visually diff against the block above — indentation is significant).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: GitHub Pages deploy workflow

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

(Actual deployment is enabled once, manually, by the repo owner in GitHub Settings → Pages → Source: "GitHub Actions" — this is a one-time step documented in Task 29's `docs/SETUP.md`, not something this workflow file can do on its own.)

---

## Task 29: Documentation — README.md, docs/SETUP.md, docs/MECHANICS.md

**Files:**
- Create: `README.md`
- Create: `docs/SETUP.md`
- Create: `docs/MECHANICS.md`

**Interfaces:**
- Produces: none (documentation only). Consumes nothing — references the finished pipeline/app from Tasks 1-28.

- [ ] **Step 1: Write README.md**

`README.md`:
```markdown
# Albion Online Crafting & Market Profit Tool

Zeigt für den kompletten craftbaren Item-Katalog von Albion Online (Europe-Server),
ob Crafting + Verkauf sich gegenüber Kaufen/Verkaufen lohnt — inklusive Resource
Return Rate, Städte-Spezialisierung, Fokus, Steuern und Stationsgebühr.

Phase 1 (dieses Repo): Ausrüstung, Waffen, Off-Hands, Capes/Taschen, Tränke, Essen,
Mounts, Rohstoff-Veredelung, Enchant-Level .0–.4.

Gathering-Profit und Black-Market-Flipping sind spätere Phasen (siehe
`docs/superpowers/specs/`).

## Quickstart

1. Rezepte generieren (einmalig, dann bei jedem Spiel-Patch erneut):
   ```bash
   cd pipeline
   pip install -r requirements.txt
   python generate_recipes.py
   ```
2. App starten:
   ```bash
   cd app
   npm install
   npm run dev
   ```
3. Im Browser öffnen (Vite zeigt die URL an, standardmäßig http://localhost:5173).

Details: [docs/SETUP.md](docs/SETUP.md) (lokales Setup, Deployment auf GitHub Pages)
und [docs/MECHANICS.md](docs/MECHANICS.md) (alle Formeln).

## Tests

```bash
pytest                    # Pipeline (von der Repo-Wurzel aus)
cd app && npm run test    # App
```

## Architektur

Reine Client-seitige Web-App (React + Vite + TypeScript), kein Backend — die
Albion-Data-API erlaubt offenes CORS. Eine Python-Pipeline erzeugt einmalig pro
Patch den Rezept-Katalog aus dem offiziellen `ao-bin-dumps`-Datendump. Details im
[Design-Dokument](docs/superpowers/specs/2026-08-17-albion-crafting-tool-design.md).
```

- [ ] **Step 2: Write docs/SETUP.md**

`docs/SETUP.md`:
```markdown
# Setup

## Voraussetzungen

- Python 3.11+
- Node.js 20+
- Internetzugang beim ersten Pipeline-Lauf (lädt `items.json` von
  `ao-data/ao-bin-dumps` herunter und cached es lokal in `pipeline/.cache/`)

## 1. Rezepte generieren

```bash
cd pipeline
pip install -r requirements.txt
python generate_recipes.py
```

Erzeugt `app/public/data/recipes.json` und `app/public/data/recipes_core.json`.
Mit `--refresh` wird der lokale Cache ignoriert und neu heruntergeladen (bei
einem neuen Spiel-Patch):

```bash
python generate_recipes.py --refresh
```

## 2. App lokal starten

```bash
cd app
npm install
npm run dev
```

Öffnet einen lokalen Dev-Server (Standard: http://localhost:5173).

## 3. Tests

```bash
pytest                    # von der Repo-Wurzel aus
cd app && npm run test
```

## 4. Deployment auf GitHub Pages

Der Workflow `.github/workflows/deploy.yml` baut, testet und deployed automatisch
bei jedem Push auf `main`. Einmalig in den Repo-Einstellungen aktivieren:

1. GitHub Repo → Settings → Pages → Source: "GitHub Actions".
2. `app/vite.config.ts`: `base` muss dem Repo-Namen entsprechen, z.B. bei
   `github.com/<user>/albion-crafting-tool` ist `base: '/albion-crafting-tool/'`
   bereits korrekt. Bei einem anderen Repo-Namen hier anpassen.
3. Push auf `main` → die App ist danach unter
   `https://<user>.github.io/albion-crafting-tool/` erreichbar.

## Rezepte aktualisieren (nach einem Spiel-Patch)

```bash
cd pipeline
python generate_recipes.py --refresh
git add app/public/data/recipes.json app/public/data/recipes_core.json
git commit -m "Rezepte aktualisiert"
git push
```

Kein App-Rebuild nötig für reine Rezept-Updates auf GitHub Pages — der Workflow
baut bei jedem Push automatisch neu.

## Städte-Spezialisierung aktuell halten

`app/src/data/city_specializations.json` ist von Hand gepflegt (siehe `lastVerified`-
Feld in der Datei). Bei einem Balance-Patch, der Städte-Boni ändert: Werte in dieser
Datei anpassen, `npm run test -- citySpecializations` laufen lassen, committen.
```

- [ ] **Step 3: Write docs/MECHANICS.md**

`docs/MECHANICS.md`:
```markdown
# Spielmechanik-Formeln

Vollständige, autoritative Quelle: [`MECHANICS_SOURCE.md`](MECHANICS_SOURCE.md).
Diese Seite ist die kurze, lesbare Zusammenfassung für die tägliche Nutzung.

## Resource Return Rate (RRR)

```
bonus = Stadt-Basis (0.18) + Städte-Spezialisierung (+0.15 Crafting / +0.40 Refining)
        + Daily Bonus (0/0.10/0.20) + Hideout/Guild-Bonus (editierbar)
        + Fokus (+0.59, falls aktiv)
RRR   = bonus / (1 + bonus)
```

Artefakte, Runen, Seelen, Reliquien und Fraktions-Token werden NICHT durch RRR
zurückerstattet — sie werden immer zum vollen Preis berechnet.

## Städte-Spezialisierung

| Stadt | Crafting +15% | Refining +40% |
|---|---|---|
| Fort Sterling | Hammer, Speer, Holy Staff, Plattenhelm, Stoffrobe | Holz→Bretter |
| Lymhurst | Bogen, Schwert, Arcane Staff, Lederhelm, Lederschuhe | Faser→Stoff |
| Bridgewatch | Armbrust, Dolch, Cursed Staff, Plattenrüstung, Stoffschuhe | Stein→Blöcke |
| Martlock | Axt, Quarterstaff, Frost Staff, Plattenschuhe, alle Off-Hands | Haut→Leder |
| Thetford | Streitkolben, Fire Staff, Nature Staff, Lederrüstung, Stoffhelm | Erz→Barren |
| Caerleon | Essen, Sammel-Gear/Tools | — |
| Brecilien | Capes, Taschen, Tränke | — |

Die App ermittelt die passende Stadt automatisch anhand der `@shopsubcategory1`/
`@shopcategory`-Felder aus dem Spieldatendump (siehe
`app/src/data/city_specializations.json`) — keine manuelle Zuordnung nötig.

## Fokus

Premium-only, 10.000/Tag, Cap 30.000. Die App zeigt die **Basis-Fokuskosten** aus dem
Rezept — reale Kosten können durch Destiny-Board Focus Cost Efficiency niedriger sein.

`Silber/Fokus = Profit pro Batch / Basis-Fokuskosten` — die wichtigste Kennzahl zum
Vergleichen, was sich pro Fokuspunkt am meisten lohnt.

## Steuern & Gebühren

- Sales Tax: 4% mit Premium, 8% ohne.
- Sell-Order-Setup-Fee: 2.5% (nur bei Sell-Order, nicht bei Instant-Sell).
- Stationsgebühr: `Item-Value × 0.1125 × (Gebühr/100 Nutrition ÷ 100)`, 0 für T1/T2.
  Bei Tränken/Essen ist der Item-Value geschätzt (Summe der Zutaten-Werte) — die
  App markiert das explizit (`item_value_is_estimate`).

## Kauf-/Verkaufs-Strategie

- Kaufen (Instant): `sell_price_min`. Kaufen (Order): `buy_price_max`.
- Verkaufen (Order): `sell_price_min` − Setup-Fee − Steuer. Verkaufen (Instant):
  `buy_price_max` − Steuer, kein Setup.

## NO PRICE DATA

Fehlt der Preis für ein Material oder den Output, wird die Zeile als "NO PRICE DATA"
markiert und aus der Profit-/Silber-pro-Fokus-Sortierung ausgeschlossen.
```

- [ ] **Step 4: Verify all doc links resolve**

Run: `ls docs/MECHANICS_SOURCE.md docs/SETUP.md docs/MECHANICS.md README.md docs/superpowers/specs/2026-08-17-albion-crafting-tool-design.md`
Expected: all five files listed, no "No such file" errors.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/SETUP.md docs/MECHANICS.md
git commit -m "docs: README, setup guide and mechanics reference

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Phase 1 Definition of Done (final check)

After Task 29, verify all of the following before considering Phase 1 complete:

- [ ] `pytest` (repo root) passes all pipeline tests (~53 tests across Tasks 2-13)
- [ ] `cd app && npm run test` passes all app tests (~40 tests across Tasks 15-27)
- [ ] `cd app && npm run build` succeeds
- [ ] `cd pipeline && python generate_recipes.py` runs against the real data dump and produces a non-empty `app/public/data/recipes.json` with a printed summary
- [ ] `cd app && npm run dev` opens a working dashboard showing real recipe rows (NO PRICE DATA until "Preise aktualisieren" is clicked)
- [ ] README.md, docs/SETUP.md, docs/MECHANICS.md exist and cross-reference correctly
