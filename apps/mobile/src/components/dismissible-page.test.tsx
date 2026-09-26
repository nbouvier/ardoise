import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { DismissiblePage, dismissesPage } from './dismissible-page';

/** A downward drag of the banner, ending `translationY` below where it started. */
async function pullDown(translationY: number, velocityY = 0) {
  await act(async () => {
    fireGestureHandler(getByGestureTestId('dismiss-page'), [
      { state: State.BEGAN, translationY: 0 },
      { state: State.ACTIVE, translationY: translationY / 2 },
      { state: State.END, translationY, velocityY },
    ]);
    // The page finishes sliding away before it closes.
    jest.advanceTimersByTime(500);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('dismissesPage', () => {
  it('closes on a long pull, or a quick flick past a small distance', () => {
    expect(dismissesPage(160, 0)).toBe(true);
    expect(dismissesPage(40, 1200)).toBe(true);
  });

  it('springs back on a short, slow pull, or a flick that barely moved', () => {
    expect(dismissesPage(60, 100)).toBe(false);
    expect(dismissesPage(10, 1500)).toBe(false);
  });
});

describe('DismissiblePage', () => {
  it('closes when its banner is pulled down far enough', async () => {
    const onClose = jest.fn();
    await render(
      <DismissiblePage enabled onClose={onClose} header={<Text>Corsica 2026</Text>}>
        <Text>Transactions</Text>
      </DismissiblePage>,
    );
    expect(screen.getByText('Transactions')).toBeTruthy();

    await pullDown(200);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open when the pull falls short', async () => {
    const onClose = jest.fn();
    await render(
      <DismissiblePage enabled onClose={onClose} header={<Text>Corsica 2026</Text>}>
        <Text>Transactions</Text>
      </DismissiblePage>,
    );

    await pullDown(50);

    expect(onClose).not.toHaveBeenCalled();
  });
});
