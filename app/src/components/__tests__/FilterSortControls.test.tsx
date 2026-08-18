import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterSortControls, DEFAULT_FILTERS } from '../FilterSortControls';

describe('FilterSortControls', () => {
  it('calls onChange with the updated category', () => {
    const onChange = vi.fn();
    render(<FilterSortControls filters={DEFAULT_FILTERS} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Kategorie'), { target: { value: 'weapon' } });
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, category: 'weapon' });
  });

  it('calls onChange with the updated sort key', () => {
    const onChange = vi.fn();
    render(<FilterSortControls filters={DEFAULT_FILTERS} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Sortieren nach'), { target: { value: 'silverPerFocus' } });
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, sortKey: 'silverPerFocus' });
  });
});
