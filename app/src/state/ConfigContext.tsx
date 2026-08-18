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
