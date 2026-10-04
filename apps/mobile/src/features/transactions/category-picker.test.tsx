import { TRANSACTION_CATEGORIES } from '@ardoise/shared';
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { CategoryPicker } from './category-picker';

describe('CategoryPicker', () => {
  it('shows every preset category', async () => {
    await render(<CategoryPicker value="other" onChange={jest.fn()} />);

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
    await render(<CategoryPicker value="other" onChange={onChange} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Leisure' }));

    expect(onChange).toHaveBeenCalledWith('leisure');
  });

  it('reports the same category again when its own pill is pressed', async () => {
    const onChange = jest.fn();
    await render(<CategoryPicker value="leisure" onChange={onChange} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Leisure' }));

    expect(onChange).toHaveBeenCalledWith('leisure');
  });
});
