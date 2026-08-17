# Albion Online Crafting & Market Profit Tool — Design (Phase 1)

Status: Approved by owner (Marcel), 2026-08-17.

## 0. Kontext & Herkunft dieses Specs

Dieses Spec basiert auf einem sehr detaillierten Master-Prompt des Owners (vollständig
enthalten in der Konversationshistorie, als `docs/MECHANICS_SOURCE.md` mit ins Repo zu
übernehmen), der bereits sämtliche Spielmechanik-Formeln, Datenquellen, ID-Formate und
Edge Cases spezifiziert. Dieses Design-Dokument beschreibt, **was sich gegenüber diesem
Master-Prompt geändert hat** und **wie das Projekt strukturiert wird** — es ersetzt NICHT
die Formel-Spezifikation aus dem Master-Prompt (§2/§3/§10 dort bleiben die Quelle der
Wahrheit für alle Berechnungen).

## 1. Scope-Entscheidung (Phasenmodell)

Der Owner möchte am Ende: vollständiger Crafting/Refining/Enchant-Katalog, Gathering-Profit,
Black-Market-Flipping und Guild-/Hideout-Boni. Das ist zu groß für einen Implementierungs-
Zyklus. Entscheidung: **phasenweise**, ein Repo/eine App, mehrere Specs.

- **Phase 1 (dieses Spec):** Datenpipeline + Rechen-Engine + Web-Dashboard für den
  vollständigen Crafting/Refining/Enchanting-Katalog (Ausrüstung, Waffen, Off-Hands,
  Capes/Taschen, Tränke, Essen, Mounts, Rohstoff-Veredelung, Enchant-Level .0–.4).
  Enthält Städte-Spezialisierung, Fokus, Steuern, Stationsgebühr, und einen generischen
  Hideout/Guild-Bonus-Eingabewert.
- **Phase 2 (später, eigenes Spec):** Gathering-Profit-Modul (eigene Berechnungslogik,
  eigener Tab, nutzt dieselbe Preis-/Städte-Infrastruktur).
- **Phase 3 (später, eigenes Spec):** Black-Market-Flipping-Modul (Kauf am Markt / Verkauf
  am Black Market oder Stadt-zu-Stadt, eigene Berechnungslogik).
- Guild-/Hideout-Bonus ist in Phase 1 bereits als **generischer, editierbarer Prozentwert**
  im Config enthalten (kein exaktes Power-Core-Modell), damit er in Phase 1 UND Phase 2
  wiederverwendbar ist, ohne detailliertes Nachbauen der Hideout-Powerlevel-Mechanik.

## 2. Plattform-Entscheidung

Ursprünglich (Master-Prompt): Google Sheets + Apps Script, mit optionaler Web-App-Variante
in §11. Entscheidung nach Rücksprache: **Standalone Client-seitige Web-App**, weil:

- Der Owner hat keine eigene Serverinfrastruktur außer GitHub und dem eigenen Rechner.
- Die Albion-Data-API erlaubt CORS für beliebige Origins (geprüft am 2026-08-17:
  `access-control-allow-origin: *` auf `https://europe.albion-online-data.com/api/v2/...`),
  d.h. eine reine Client-App kann Live-Preise direkt im Browser abrufen — **kein Backend
  nötig**.
- Der Owner will eine "saubere, übersichtliche Oberfläche" vergleichbar mit existierenden
  Community-Tools (albiondatabase.com, albioncodex.com, albionfreemarket.com,
  albioncraftpro.com, tools4albion.com, albiononlinegrind.com) — mit reinen Google-Sheets-
  Zellen ist das nur eingeschränkt erreichbar.
- Deployment: statischer Build (`npm run build`), lauffähig lokal (`npm run dev` /
  `npm run preview`) oder kostenlos über GitHub Pages aus demselben Repo.

Tech-Stack: **React + Vite + TypeScript**.

## 3. Architektur & Repo-Layout

```
albion-crafting-tool/
├── README.md
├── docs/
│   ├── SETUP.md              # Lokales Setup, Pipeline-Lauf, Deployment auf GitHub Pages
│   ├── MECHANICS.md          # Formeln aus Master-Prompt §2, für den Owner aufbereitet
│   └── superpowers/specs/    # Design-Dokumente (dieses hier)
├── pipeline/                  # Python 3.11+, offline, nur bei Patch-Updates ausgeführt
│   ├── generate_recipes.py    # -> data/recipes.json (+ data/recipes_core.json für Tests)
│   ├── calc_reference.py      # reine Formel-Funktionen, Referenz für Python-Tests
│   └── requirements.txt
├── data/
│   ├── recipes.json           # Vollkatalog, von der Pipeline erzeugt, committed
│   ├── recipes_core.json      # kleines Testset (Refining T2–T8, Cloth-Set T4–T8, Heal-Potion T4–T8)
│   └── city_specializations.json  # City -> {crafting: [Kategorien/Slots], refining: [Ressourcen]}
├── app/                        # React + Vite + TypeScript
│   ├── src/
│   │   ├── calc/               # reine Berechnungsfunktionen, 1:1 zu calc_reference.py
│   │   │   ├── returnRate.ts
│   │   │   ├── stationFee.ts
│   │   │   ├── profit.ts
│   │   │   └── __tests__/calc.test.ts
│   │   ├── data/
│   │   │   ├── loadRecipes.ts       # fetch recipes.json (bundled oder von raw.githubusercontent.com)
│   │   │   ├── aodpClient.ts        # Preis-API-Client, Batching ≤100 IDs, Retry/Timeout
│   │   │   └── priceCache.ts        # localStorage-Cache mit Alter/Timestamp
│   │   ├── components/
│   │   │   ├── ConfigPanel.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── PriceRefreshBar.tsx
│   │   │   └── FilterSortControls.tsx
│   │   └── pages/App.tsx
│   ├── index.html
│   └── vite.config.ts
└── tests/                       # Python-seitige Pipeline-/Formel-Tests
    ├── test_calc.py             # exakte §8-Fälle aus dem Master-Prompt + Hideout-Fall
    └── test_pipeline.py
```

**Trennung Pipeline (Python) / App (TypeScript):** Der 17-MB `items.json`-Dump von
ao-bin-dumps wird ausschließlich offline in Python geparst. Ergebnis ist ein schlankes
`data/recipes.json` (wenige hundert KB), das im Repo committed und zur Laufzeit von der
App geladen wird (entweder gebundlet im Build oder per `fetch` von
`raw.githubusercontent.com` — letzteres bevorzugt, damit ein Pipeline-Update kein
Rebuild/Redeploy der App erfordert, nur `git push`).

## 4. Datenpipeline — Ergänzungen zum Master-Prompt

Master-Prompt §3–§5 bleiben die formale Spezifikation für: RRR-Formel, Fokus, Steuern,
Stationsgebühr, Item-Value-Berechnung, Rezept-Extraktion (dict-or-list-Normalisierung,
Nicht-Fraktions-Varianten-Regel, Enchant-Handling für Ressourcen vs. Ausrüstung/
Konsumgüter, Artefakt/Rune/Soul/Relic/Token-Ausnahme bei RRR), Datenquellen-URLs und
-Schemas, ID-Formate, Städte-Liste. Diese werden 1:1 übernommen.

**Neu/geändert gegenüber Master-Prompt:**

1. **Item-Kategorien erweitert um `mount`:** Zusätzlich zu `simpleitem`, `equipmentitem`,
   `weapon`, `consumableitem` wird auch die Kategorie `mount` (Pferde, Ochsen, Direwolves,
   Mammuts etc., am Stall craftbar) extrahiert — gleiche Regeln (craftingrequirements,
   Nicht-Fraktions-Variante).
2. **`city_specializations.json` neu:** Da die Städte-Spezialisierung im Master-Prompt nur
   als generisches `productionBonus`-Preset beschrieben war, aber nicht, welche Stadt
   welche konkrete Kategorie/Ausrüstungsslot bzw. Ressource bonisiert, wird diese Datei von
   Hand aus recherchierten Daten (Albion Wiki / AlbionCodex, Stand 2026-08-17) gepflegt:

   | Stadt | Crafting +15% (Kategorie/Slot) | Refining +40% (Ressource) |
   |---|---|---|
   | Fort Sterling | Hammer, Speer, Holy Staff, Plattenhelm, Stoffrobe | Holz |
   | Lymhurst | Bogen, Schwert, Arcane Staff, Lederhelm, Lederschuhe | Faser |
   | Bridgewatch | Armbrust, Dolch, Cursed Staff, Plattenrüstung, Stoffschuhe | Stein |
   | Martlock | Axt, Quarterstaff, Frost Staff, Plattenschuhe, alle Off-Hands | Haut |
   | Thetford | Streitkolben, Fire Staff, Nature Staff, Lederrüstung, Stoffhelm | Erz |
   | Caerleon | Essen, Sammel-Gear/Tools, War Gloves, Shapeshifter Staff | — |
   | Brecilien | Capes, Taschen, Tränke | — |

   Dies ist statisches Spielwissen, das sich nur bei Balance-Patches ändert — kein Live-
   API-Feed verfügbar, daher manuell gepflegte JSON-Datei mit Kommentarfeld
   "last_verified: 2026-08-17".
3. **Output-Format JSON statt CSV** (da die App JS/TS ist, kein Apps-Script-Import mehr
   nötig): gleiche Spalten/Felder wie Master-Prompt §5.6, aber als Array von Objekten.
   `recipes_core.json` ersetzt `recipes_core.csv` mit identischem Inhalt (§5.7).

Alle übrigen Pipeline-Anforderungen (Zusammenfassung ausgeben, deterministische
Sortierung, Skip-Gründe loggen) bleiben wie in Master-Prompt §5.8 beschrieben.

## 5. Rechen-Engine

Reine, ungetestete-gegen-die-API Funktionen, gespiegelt zwischen
`pipeline/calc_reference.py` (Python-Referenz + Tests) und `app/src/calc/*.ts`
(Laufzeit-Nutzung in der App). Gleiche Konstanten, gleiche Formeln.

- `resourceReturnRate({ baseCityBonus, specBonus, dailyBonus, hideoutBonus, useFocus })`
  → `bonus = baseCityBonus + specBonus + dailyBonus + hideoutBonus + (useFocus ? 0.59 : 0)`;
  `RRR = bonus / (1 + bonus)`.
  - `specBonus` wird automatisch aus `city_specializations.json` ermittelt: sobald die im
    Config gewählte Craft-/Buy-Stadt für die Item-Kategorie bzw. Ressource in der Tabelle
    gelistet ist, wird der Bonus (0.15 Crafting / 0.40 Refining) automatisch angewendet —
    keine manuelle Eingabe durch den Nutzer nötig.
  - `hideoutBonus`: neues Config-Feld "Zusatz-Bonus % (Hideout/Guild)", Default 0,
    generischer additiver Wert (kein Power-Core-Modell), editierbar da patchabhängig.
- `stationFee(itemValue, feePer100Nutrition, tier)`: 0 für T1/T2, sonst
  `itemValue × 0.1125 × feePer100Nutrition / 100`. Konsumgüter-Fee wird als "geschätzt"
  markiert (Item-Value-Summierung überschätzt laut Master-Prompt §2.5/§10).
- `materialCost(materials, buyPrices, rrr)`: Σ(Preis×Menge) × (1−RRR), mit Ausnahme für
  Artefakt/Rune/Soul/Relic/Token-IDs (voller Preis, keine Rückerstattung).
- `netRevenuePerUnit(sellPrice, salesTax, setupFee)`,
  `profit(costPerUnit, netRevenue)`, `silverPerFocus(profitPerBatch, baseFocusCost)` —
  exakt wie Master-Prompt §2.3–§2.6.

## 6. Web-App UI

- **Config-Panel:** Buy-Stadt, Sell-Stadt, Buy-Modus (instant/order), Sell-Modus
  (instant/order), Premium (ja/nein), Fokus nutzen (ja/nein), Daily Bonus (0/10/20%),
  Hideout/Guild-Bonus % (Freitext-Zahl), Stationsgebühr/100 Nutrition (Default 150),
  Qualität (Default 1). State im Browser, per `localStorage` persistiert zwischen
  Sitzungen.
- **Dashboard:** Tabelle mit allen Feldern aus Master-Prompt §1 (Item-ID, Name, Tier,
  Enchant, Output-Menge, Materialkosten nach RRR, Stationsgebühr, Kosten/Einheit,
  Verkaufspreis, Nettoerlös/Einheit, Profit/Einheit, Marge %, Profit/Craft, Fokuskosten,
  Silber/Fokus, Preis-Alter in Stunden, NO-PRICE-DATA-Flag). Sortierbar nach Profit und
  Silber/Fokus. Filterbar nach Kategorie, Tier, Enchant-Level, "nur profitabel". Bedingte
  Formatierung: Profit > 0 grün, < 0 rot, NO-PRICE-DATA grau/ausgegraut und aus der
  numerischen Sortierung ausgeschlossen.
- **Preis-Refresh:** Button "Preise aktualisieren" lädt standardmäßig nur für die aktuell
  gefilterte Ansicht (chunked, ≤100 IDs/Request an die AODP-API, URL-encoded, kleine
  Delays zwischen Batches, `AbortController`/Timeout-Handling), mit Fortschrittsbalken.
  Ergebnis wird in `localStorage` gecacht mit Timestamp (Alter-Anzeige im Dashboard). Ein
  "Alle laden"-Button erlaubt Preis-Refresh für den kompletten Katalog.

## 7. Tests & Definition of Done (Phase 1)

**Formel-Tests** (`tests/test_calc.py` + `app/src/calc/__tests__/calc.test.ts`, gleiche
Fälle auf beiden Seiten):

1. Refining-Beispiel (T4_CLOTH) — exakte Zahlen aus Master-Prompt §8.1.
2. Gear-Beispiel (T4_HEAD_CLOTH_SET1) — exakte Zahlen aus Master-Prompt §8.2.
3. No-Price-Data-Flag korrekt gesetzt und aus Sortierung ausgeschlossen.
4. T1/T2-Stationsgebühr = 0.
5. Batch-Craft (z.B. Potion mit `amountcrafted=5`) korrekt pro Einheit berechnet.
6. **Neu:** Hideout/Guild-Bonus wird korrekt additiv in den RRR-Stack übernommen (z.B.
   +10% Hideout-Bonus zusätzlich zu Stadt-Basis+Spezialisierung+Fokus ergibt den erwarteten
   RRR-Wert).

**Pipeline-Tests** (`tests/test_pipeline.py`): Rezept-Extraktion für `T4_CLOTH` und
`T4_HEAD_CLOTH_SET1@1` wie Master-Prompt §8 (Pipeline-Tests), zusätzlich: Mount-Kategorie
wird korrekt extrahiert, `city_specializations.json`-Zuordnung stimmt mit der Tabelle in
§4 dieses Dokuments überein.

**Definition of Done (Phase 1):**

- `pipeline/generate_recipes.py` erzeugt `data/recipes.json` (Vollkatalog inkl. Mounts,
  Enchants .0–.4, EN-Namen) und `data/recipes_core.json`, deterministisch, mit
  Zusammenfassung (Item-Anzahl pro Kategorie, übersprungene Items mit Gründen).
- `app/` baut fehlerfrei mit `npm run build` zu statischen Dateien; läuft lokal mit
  `npm run dev`; deploybar auf GitHub Pages aus demselben Repo (Anleitung in
  `docs/SETUP.md`).
- Config-Panel, Dashboard, Preis-Refresh (chunked, gecacht, mit Alter-Anzeige) funktionieren
  wie in §6 beschrieben.
- Alle Tests aus §7 sind grün, auf Python- UND TypeScript-Seite.
- `README.md`, `docs/SETUP.md`, `docs/MECHANICS.md` sind geschrieben.
- Gathering-Modul und Black-Market-Flipping-Modul sind **explizit nicht** Teil dieses DoD
  — sie kommen als eigene Specs (Phase 2/3), sobald Phase 1 steht.

## 8. Out of scope (Phase 1)

- Gathering-Profit-Berechnung (Phase 2).
- Black-Market-Flipping-Berechnung (Phase 3).
- Exaktes Hideout-Power-Core-Modell (nur generischer Bonus-Prozentwert).
- Google Sheets/Apps Script als Zielplattform (verworfen zugunsten Web-App, s. §2).
- Server-seitiges Caching/Backend (nicht nötig dank offenem CORS der AODP-API).
