import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { DateRangeField } from './date-range-field';
import { formatOccurredOnShort } from './date-picker-props';

describe('DateRangeField', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Platform.OS = originalOS;
  });

  describe('on Android', () => {
    it('reads "Any" until a bound is set, truncated to a single line', async () => {
      Platform.OS = 'android';
      await render(<DateRangeField label="From" value={null} onChange={jest.fn()} />);

      const field = screen.getByRole('button', { name: 'From: Any' });
      expect(field).toBeTruthy();
      expect(screen.getByText('Any').props.numberOfLines).toBe(1);
      expect(screen.queryByRole('button', { name: 'Clear from' })).toBeNull();
    });

    it('opens a native dialog on tap and reports the picked date', async () => {
      Platform.OS = 'android';
      const onChange = jest.fn();
      await render(<DateRangeField label="From" value={null} onChange={onChange} />);

      expect(screen.queryByRole('button', { name: 'date-picker-mock' })).toBeNull();
      await fireEvent.press(screen.getByRole('button', { name: 'From: Any' }));
      await fireEvent.press(screen.getByRole('button', { name: 'date-picker-mock' }));

      expect(onChange).toHaveBeenCalledWith('2027-01-15');
      expect(screen.queryByRole('button', { name: 'date-picker-mock' })).toBeNull();
    });

    it('shows a set bound in short month form, truncated, with a clear control', async () => {
      Platform.OS = 'android';
      const onChange = jest.fn();
      await render(<DateRangeField label="To" value="2026-09-11" onChange={onChange} />);

      const expectedLabel = formatOccurredOnShort('2026-09-11');
      const field = screen.getByRole('button', { name: `To: ${expectedLabel}` });
      expect(field).toBeTruthy();
      expect(screen.getByText(expectedLabel).props.numberOfLines).toBe(1);

      await fireEvent.press(screen.getByRole('button', { name: 'Clear to' }));
      expect(onChange).toHaveBeenCalledWith(null);
    });

    it('lets a set bound be changed again through the same dialog', async () => {
      Platform.OS = 'android';
      const onChange = jest.fn();
      const expectedLabel = formatOccurredOnShort('2026-09-11');
      await render(<DateRangeField label="From" value="2026-09-11" onChange={onChange} />);

      await fireEvent.press(screen.getByRole('button', { name: `From: ${expectedLabel}` }));
      await fireEvent.press(screen.getByRole('button', { name: 'date-picker-mock' }));

      expect(onChange).toHaveBeenCalledWith('2027-01-15');
    });
  });

  describe('on iOS', () => {
    it('reads "Any" until tapped, truncated to a single line', async () => {
      Platform.OS = 'ios';
      await render(<DateRangeField label="From" value={null} onChange={jest.fn()} />);

      expect(screen.getByRole('button', { name: 'From: Any' })).toBeTruthy();
      expect(screen.getByText('Any').props.numberOfLines).toBe(1);
    });

    it('defaults to today on first tap, then reports the picked date', async () => {
      Platform.OS = 'ios';
      const onChange = jest.fn();
      await render(<DateRangeField label="From" value={null} onChange={onChange} />);

      await fireEvent.press(screen.getByRole('button', { name: 'From: Any' }));

      expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    });

    it('once set, shows the native field with a clear control', async () => {
      Platform.OS = 'ios';
      const onChange = jest.fn();
      await render(<DateRangeField label="To" value="2026-09-11" onChange={onChange} />);

      await fireEvent.press(screen.getByRole('button', { name: 'date-picker-mock' }));
      expect(onChange).toHaveBeenCalledWith('2027-01-15');

      await fireEvent.press(screen.getByRole('button', { name: 'Clear to' }));
      expect(onChange).toHaveBeenCalledWith(null);
    });
  });
});
