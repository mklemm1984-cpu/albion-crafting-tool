import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '../App';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('App', () => {
  it('renders the header and config panel after recipes load', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }));
    render(<App />);
    expect(await screen.findByText('Albion Crafting & Market Profit Tool')).toBeInTheDocument();
    expect(screen.getByLabelText('Kauf-Stadt')).toBeInTheDocument();
  });
});
