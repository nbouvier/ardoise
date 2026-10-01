import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { AmountInput } from './amount-input';

describe('AmountInput', () => {
  it('clears a field reading zero when it gains focus', async () => {
    await render(<AmountInput defaultValueCents={0} onChangeCents={jest.fn()} />);

    const field = screen.getByLabelText('Amount');
    expect(field).toHaveProp('value', '0.00');

    await fireEvent(field, 'focus');

    expect(field).toHaveProp('value', '');
  });

  it('leaves a non-zero field untouched on focus', async () => {
    await render(<AmountInput defaultValueCents={1234} onChangeCents={jest.fn()} />);

    const field = screen.getByLabelText('Amount');
    await fireEvent(field, 'focus');

    expect(field).toHaveProp('value', '12.34');
  });
});
