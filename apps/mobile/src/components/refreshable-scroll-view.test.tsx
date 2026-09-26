import { describe, expect, it, jest } from '@jest/globals';
import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import {
  PullToRefreshScrollView,
  REFRESH_PULL,
  refreshesOnRelease,
} from './refreshable-scroll-view';

/** A pull down from the top, letting go `translationY` below where it started. */
async function pull(translationY: number) {
  await act(async () => {
    fireGestureHandler(getByGestureTestId('pull-to-refresh'), [
      { state: State.BEGAN, translationY: 0 },
      { state: State.ACTIVE, translationY: translationY / 2 },
      { state: State.END, translationY },
    ]);
  });
}

describe('refreshesOnRelease', () => {
  it('asks for a long pull — twice the mark, since the pull resists', () => {
    expect(refreshesOnRelease(REFRESH_PULL * 2)).toBe(true);
    expect(refreshesOnRelease(REFRESH_PULL * 2 - 1)).toBe(false);
    // What the platform's own control settles for.
    expect(refreshesOnRelease(128)).toBe(false);
  });
});

// Android's drawn version; iOS (and these tests' default platform) keeps the
// native control, which the screens' own tests drive.
describe('PullToRefreshScrollView', () => {
  it('refreshes when let go past the mark, and shows the spinner while it runs', async () => {
    const onRefresh = jest.fn();
    const view = await render(
      <PullToRefreshScrollView refreshing={false} onRefresh={onRefresh}>
        <Text>Groups</Text>
      </PullToRefreshScrollView>,
    );

    await pull(REFRESH_PULL * 2 + 20);
    expect(onRefresh).toHaveBeenCalledTimes(1);

    await view.rerender(
      <PullToRefreshScrollView refreshing onRefresh={onRefresh}>
        <Text>Groups</Text>
      </PullToRefreshScrollView>,
    );
    expect(screen.getByTestId('pull-to-refresh-spinner')).toBeTruthy();
  });

  it('does nothing on a short pull', async () => {
    const onRefresh = jest.fn();
    await render(
      <PullToRefreshScrollView refreshing={false} onRefresh={onRefresh}>
        <Text>Groups</Text>
      </PullToRefreshScrollView>,
    );

    await pull(140);

    expect(onRefresh).not.toHaveBeenCalled();
    expect(screen.queryByTestId('pull-to-refresh-spinner')).toBeNull();
  });
});
