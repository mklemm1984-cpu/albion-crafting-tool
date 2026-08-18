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
