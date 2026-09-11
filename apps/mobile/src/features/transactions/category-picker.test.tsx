import { TRANSACTION_CATEGORIES } from '@splitcount/shared';
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { CategoryPicker } from './category-picker';

describe('CategoryPicker', () => {
  it('shows every preset category', async () => {
    await render(<CategoryPicker value={null} onChange={jest.fn()} />);

    for (const category of TRANSACTION_CATEGORIES) {
      expect(screen.getByRole('button', { name: category.label })).toBeTruthy();
    }
  });

  it('marks only the current value as selected', async () => {
    await render(<CategoryPicker value="health" onChange={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Health' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: true }),
    );
    expect(screen.getByRole('button', { name: 'Groceries' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: false }),
    );
  });

  it('reports the picked category', async () => {
    const onChange = jest.fn();
    await render(<CategoryPicker value={null} onChange={onChange} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Leisure' }));

    expect(onChange).toHaveBeenCalledWith('leisure');
  });

  it('clears the value when the already-selected category is pressed again', async () => {
    const onChange = jest.fn();
    await render(<CategoryPicker value="leisure" onChange={onChange} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Leisure' }));

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
