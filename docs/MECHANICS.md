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
| Caerleon | Essen, Sammel-Gear/Tools, Fäuste (Knuckles), Shapeshifter Staff | — |
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

## Silber-Rezepte (Swaptransaction/Transmute)

Manche Rezepte (z. B. Farming-Saatgut, Ressourcen-Transmutation) haben kein
`craftresource`, sondern nur einen festen `@silver`-Preis (Händler-Swap oder
Transmute). Dieser Preis fließt als `silver_cost` additiv und **ohne RRR-Rabatt**
in die Gesamtkosten ein (`Gesamtkosten = Materialkosten + Stationsgebühr +
silver_cost`), da hier keine Materialien "verschwendet" werden können — es ist
ein Festpreis. Rezepte ohne `craftresource` UND ohne `@silver` (z. B. manche
Fraktions-Token-Käufe) haben aktuell `silver_cost = 0` und werden noch nicht
vollständig kostenkorrekt abgebildet (bekannte Lücke, siehe Projekt-Notizen).

## NO PRICE DATA

Fehlt der Preis für ein Material oder den Output, wird die Zeile als "NO PRICE DATA"
markiert und aus der Profit-/Silber-pro-Fokus-Sortierung ausgeschlossen.
