import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { DatePickerField } from './date-picker-field';
import { formatOccurredOn, parseOccurredOn, toOccurredOn } from './date-picker-props';

describe('date conversion', () => {
  it('round-trips a date string without a time-zone shift', () => {
    expect(toOccurredOn(parseOccurredOn('2026-09-11'))).toBe('2026-09-11');
    // A date near the turn of the year is the case most likely to reveal an
    // off-by-one from parsing as UTC instead of local midnight.
    expect(toOccurredOn(parseOccurredOn('2026-12-31'))).toBe('2026-12-31');
    expect(toOccurredOn(parseOccurredOn('2027-01-01'))).toBe('2027-01-01');
  });

  it('formats a readable date', () => {
    expect(formatOccurredOn('2026-09-11')).toContain('2026');
  });
});

describe('DatePickerField', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('on iOS, reports the picked date directly', async () => {
    Platform.OS = 'ios';
    const onChange = jest.fn();

    await render(<DatePickerField value="2026-09-11" onChange={onChange} />);
    await fireEvent.press(screen.getByRole('button', { name: 'date-picker-mock' }));

    expect(onChange).toHaveBeenCalledWith('2027-01-15');
  });

  it('on Android, opens a dialog on tap and closes it once a date is picked', async () => {
    Platform.OS = 'android';
    const onChange = jest.fn();

    await render(<DatePickerField value="2026-09-11" onChange={onChange} />);

    expect(screen.queryByRole('button', { name: 'date-picker-mock' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Date' }));

    await fireEvent.press(screen.getByRole('button', { name: 'date-picker-mock' }));

    expect(onChange).toHaveBeenCalledWith('2027-01-15');
    expect(screen.queryByRole('button', { name: 'date-picker-mock' })).toBeNull();
  });
});
