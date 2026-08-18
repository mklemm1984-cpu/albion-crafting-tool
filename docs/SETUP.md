# Setup

## Voraussetzungen

- Python 3.11+
- Node.js 20+
- Internetzugang beim ersten Pipeline-Lauf (lädt `items.json` von
  `ao-data/ao-bin-dumps` herunter und cached es lokal in `pipeline/.cache/`)

## 1. Rezepte generieren

Für den lokalen Dev-Server (`npm run dev`) müssen die Rezepte manuell erzeugt
werden:

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

Für den GitHub-Pages-Deploy ist dieser Schritt **nicht** nötig — der Workflow
(`.github/workflows/deploy.yml`) führt `generate_recipes.py` automatisch vor
`npm run build` aus, sodass ein frischer Clone/Deploy immer mit aktuellen
Rezeptdaten ausgeliefert wird. Der lokale Lauf ist nur für `npm run dev`
erforderlich.

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
bei jedem Push auf `main` oder `master` (dieses Repo nutzt aktuell `master`).
Einmalig in den Repo-Einstellungen aktivieren:

1. GitHub Repo → Settings → Pages → Source: "GitHub Actions".
2. `app/vite.config.ts`: `base` muss exakt dem Repo-Namen entsprechen (inkl.
   Sonderzeichen wie einem Bindestrich am Ende). Für dieses Repo
   (`github.com/mklemm1984-cpu/albion-crafting-tool-`) ist
   `base: '/albion-crafting-tool-/'` bereits korrekt gesetzt. Bei einem
   Repo-Rename hier anpassen.
3. Push auf `main`/`master` → die App ist danach unter
   `https://mklemm1984-cpu.github.io/albion-crafting-tool-/` erreichbar.

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
