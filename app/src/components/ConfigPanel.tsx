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
