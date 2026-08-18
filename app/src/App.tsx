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
