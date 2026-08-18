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
