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
