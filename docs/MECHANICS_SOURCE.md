# Original Master Prompt (Source Spec)

Dies ist der ursprüngliche, vollständige Master-Prompt des Owners vom 2026-08-17, der
alle Spielmechanik-Formeln, Datenquellen, ID-Formate, Edge Cases und Akzeptanztests
spezifiziert. Er ist die **Quelle der Wahrheit für alle Berechnungen** (§2, §3, §8, §10).

Das Design-Dokument unter
`docs/superpowers/specs/2026-08-17-albion-crafting-tool-design.md` beschreibt, was sich
gegenüber diesem Master-Prompt geändert hat (Plattform: Web-App statt Google Sheets;
Scope-Phasierung; Mounts; City-Spezialisierungs-Tabelle; Hideout/Guild-Bonus) — alles
andere hier bleibt unverändert gültig.

---

## 0. Rolle & Ziel

Lead Engineer für ein Crafting- & Market-Profitability-Tool für Albion Online (Europe
Server). Ziel: für jedes craftbare Item zeigen, ob Crafting + Verkauf sich gegenüber
Kaufen/Verkaufen lohnt — unter Berücksichtigung von Resource Return Rate, Fokus, Steuern
und Stationsgebühren.

## 1. Produktanforderungen

Pro craftbarem Item: Item-ID, EN-Name, Tier, Enchant-Level, Output-Menge; Materialkosten
nach Return Rate; Stationsgebühr; Kosten/Einheit; Verkaufspreis; Nettoerlös/Einheit
(nach Steuer + optionaler Setup-Fee); Profit/Einheit, Marge %, Profit/Craft; Basis-
Fokuskosten und Silber/Fokus; Preis-Frische (Alter in Stunden) und NO-PRICE-DATA-State.
Dashboard sortierbar nach Profit und Silber/Fokus. Config-Sheet/Panel steuert alle
wirtschaftlichen Annahmen.

## 2. Spielmechaniken — autoritative Formeln

### 2.1 Resource Return Rate (RRR)

```
bonus = productionBonus (Stadt + Spezialisierungsstadt + Daily Bonus, OHNE Fokus)
        + (useFocus ? 0.59 : 0)
RRR   = bonus / (1 + bonus)
```

- Destiny-Board-Spezialisierung erhöht NICHT die RRR (nur Fokuskosten-Reduktion).
- Presets: Basis Royal City 0.18 → RRR 15.25%; Crafting-Spezialisierungsstadt 0.33
  (0.18+0.15) → 24.8%; Refining-Spezialisierungsstadt 0.58 (0.18+0.40) → 36.7%, mit Fokus
  (1.17) → RRR 53.9%; optionaler Daily Bonus +0.10/+0.20.
- Fokus: flat +0.59 auf `bonus`.
- Effektive Materialkosten = Σ(matBuyPrice × count) × (1−RRR) — Artefakte, Runen, Seelen,
  Reliquien, Fraktions-Token werden NICHT zurückerstattet (ID-Substrings: `ARTEFACT`,
  `_RUNE`, `_SOUL`, `_RELIC`, `TOKEN`).

### 2.2 Fokus

Premium-only, 10.000/Tag, Cap 30.000. Basis-`@craftingfocus` aus Rezept nutzen; reale
Kosten werden durch Destiny-Board Focus Cost Efficiency reduziert (alle 10.000 FCE
halbiert) — Tool zeigt Basis-Fokuskosten, klar als solche gekennzeichnet.
`silverPerFocus = profitPerBatch / baseFocusCost`.

### 2.3 Steuern & Gebühren (Verkauf)

Sales Tax: 4% mit Premium, 8% ohne. Sell-Order-Setup-Fee: 2.5% (nur bei Sell-Order, nicht
bei Instant-Sell). `netRevenuePerUnit = sellPrice × (1 − salesTax − setupFee)`.

### 2.4 Stationsgebühr (Crafting)

```
nutrition = itemValue × 0.1125
usageFee  = nutrition × (feePer100Nutrition / 100)   // pro Craft-Aktion
```

Keine Gebühr für T1/T2. `feePer100Nutrition` = Config-Input (Default 150). Bei
Batch-Crafts (z.B. `@amountcrafted`=5) Gebühr pro Craft-Aktion, geteilt durch Output-Menge
für Pro-Einheit-Wert.

### 2.5 Item-Value (für die Gebühr)

Rohstoffe/Veredelte Ressourcen: direktes `@itemvalue`. Pattern:
`IV = base × 2^(tier−4) × 2^enchant`. Ausrüstung/Konsumgüter ohne `@itemvalue`:
`itemValue = Σ(ingredientItemValue × count)` aus gewähltem Rezept. Bekannter Gotcha: bei
Tränken/Essen überschätzt diese Summierung den echten IV — Gebühr nur approximativ,
im UI/Docs als Schätzung kennzeichnen. Refining/Gear-Gebühren sind exakt.

### 2.6 Buy-/Sell-Strategie

Materialien kaufen — Instant: `sell_price_min`. Kaufen — Order: `buy_price_max`. Output
verkaufen — Order: `sell_price_min` + 2.5% Setup + Steuer. Verkaufen — Instant:
`buy_price_max`, kein Setup, nur Steuer. Materialien in der Kauf-Stadt bepreist, Output in
der Verkaufs-Stadt.

## 3. Datenquellen

- Rezepte + Item-Metadaten:
  `https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/items.json` (~17 MB).
  Top-Objekt `items` mit Kategorie-Arrays (`simpleitem`, `equipmentitem`, `weapon`,
  `consumableitem`, weitere). `@`-präfixierte Attribute. `craftingrequirements` und
  `craftresource` sind dict-oder-list — normalisieren. Rezept-Varianten-Auswahl: erste
  Variante ohne `FACTION`/`TOKEN`-Ressourcen. Enchantete Ressourcen:
  `T{tier}_{RES}_LEVEL{k}` als eigene `simpleitem`s. Enchantete Ausrüstung/Konsumgüter:
  unter `enchantments.enchantment[]` mit eigenem `craftingrequirements`.
  `upgraderequirements` (Runen/Seelen/Reliquien-Upgrades) wird für Craft-from-scratch-
  Kosten ignoriert. `@craftingfocus` kann Float-String sein — robust parsen.
- EN-Namen:
  `https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/formatted/items.json`
  (~23 MB). `UniqueName → LocalizedNames["EN-US"]`. Enchant-Zeilen: Basis-Name + `.k`.
- Live-Marktpreise (Europe):
  `https://europe.albion-online-data.com/api/v2/stats/prices/{IDS}.json?locations={CITIES}&qualities=1`.
  IDs comma-separated, URL-encoded (`@`→`%40`). Städte comma-separated, URL-encoded
  (Space→`%20`). Response: Array mit `sell_price_min`, `buy_price_max`, Timestamps; `0` =
  keine Daten. Batching ~100 IDs/Call, gzip, kleine Sleeps zwischen Calls. Daten können
  veraltet/spärlich sein (hohe Tiers, Nischen-Items) — Alter-Anzeige Pflicht.
- ID-Formate: Basis `T{tier}_{NAME}`; Enchantete Ressourcen `T{tier}_{RES}_LEVEL{k}`
  (AODP akzeptiert auch `@k`); Enchantete Ausrüstung/Konsumgüter `..._SET1@{k}`.
- Städte: Caerleon, Bridgewatch, Lymhurst, Martlock, Thetford, Fort Sterling, Brecilien,
  Black Market. Black Market (Caerleon) kauft nur (keine Sell-Orders,
  `sell_price_min` = 0 dort).

## 8. Akzeptanztests (deterministisch)

Shared Config: `productionBonus = 0.18`, `useFocus = true` ⇒ `bonus = 0.77`,
`RRR = 0.77/1.77 = 0.4350` (4 Nachkommastellen). `feePer100 = 150`. Premium = ja
(tax 0.04). Sell-Modus = order (setup 0.025). Buy-Modus = instant.

1. **Refining — T4_CLOTH** (Mats `T4_FIBER`×2 @200, `T3_CLOTH`×1 @150; itemValue 16;
   output 1; focus 54; sell `T4_CLOTH` sell_min 600):
   `materialCost = 550 × 0.565 = 310.75`; `fee = 16×0.1125×1.5 = 2.70`;
   `costPerUnit = 313.45`; `net = 600×0.935 = 561.00`; `profit/unit = 247.55`;
   `margin ≈ 79.0%`; `silver/focus = 247.55/54 ≈ 4.584`.
2. **Gear — T4_HEAD_CLOTH_SET1** (Mats `T4_CLOTH`×8 @600; itemValue 128; output 1;
   focus 429; sell sell_min 4000): `materialCost = 4800×0.565 = 2712.00`;
   `fee = 128×0.1125×1.5 = 21.60`; `cost/unit = 2733.60`; `net = 4000×0.935 = 3740.00`;
   `profit/unit = 1006.40`; `margin ≈ 36.8%`; `silver/focus = 1006.40/429 ≈ 2.346`.
3. **No-Price-Data**: Material- oder Output-Preis 0/fehlend → Zeile als NO-PRICE-DATA
   geflaggt, aus numerischer Sortierung ausgeschlossen.
4. **T1/T2-Gebühr = 0**: T2-Refined-Item hat keine Stationsgebühr.
5. **Batch**: Potion mit `@amountcrafted=5` teilt Gesamt-Batch-Kosten durch 5 für
   Pro-Einheit; Silber/Fokus nutzt Profit für den gesamten Batch.

## 10. Bekannte Gotchas

- `craftingrequirements`/`craftresource` jeweils dict-oder-list — vor Iteration
  normalisieren.
- Mehrere Rezept-Varianten (Standard vs. Fraktion) — immer Standard wählen.
- Konsumgüter-Item-Value aus Σ-Roh überschätzt die echte Gebühr → als approximativ
  markieren.
- Enchantete Ressourcen = eigene `_LEVELk`-Items; enchantete Ausrüstung/Konsumgüter unter
  `enchantments` verschachtelt — zwei unterschiedliche Extraktionspfade.
- Artefakte/Runen/Seelen/Reliquien/Token werden nicht durch RRR zurückerstattet — voller
  Preis.
- `@` und Städte-Leerzeichen URL-encoden; Black Market hat keine Sell-Orders.
- Preise sind crowd-sourced, oft veraltet/spärlich bei hohen Tiers — Alter-Spalte und
  NO-PRICE-DATA-State sind tragend, keine Dekoration.
