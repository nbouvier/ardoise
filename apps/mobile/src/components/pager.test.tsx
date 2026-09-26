import { describe, expect, it, jest } from '@jest/globals';
import { act, render, screen } from '@testing-library/react-native';
import { Dimensions, Text } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { dragPosition, Pager, pageAfterSwipe } from './pager';

const PAGES = ['Transactions', 'Balances', 'Statistics', 'Manage'];

/** A sideways swipe over the pager, ending `fraction` of a page from where it started. */
async function swipe(fraction: number, velocityX = 0) {
  // No layout under Jest: a page is as wide as the window.
  const translationX = fraction * Dimensions.get('window').width;
  await act(async () => {
    fireGestureHandler(getByGestureTestId('pager'), [
      { state: State.BEGAN, translationX: 0 },
      { state: State.ACTIVE, translationX: translationX / 2 },
      { state: State.END, translationX, velocityX },
    ]);
  });
}

describe('pageAfterSwipe', () => {
  it('turns to the next page when dragged well towards it, the previous one the other way', () => {
    expect(pageAfterSwipe(1, 4, 0.5, 0)).toBe(2);
    expect(pageAfterSwipe(1, 4, -0.5, 0)).toBe(0);
  });

  it('turns on a short but quick flick too', () => {
    expect(pageAfterSwipe(1, 4, 0.15, -1200)).toBe(2);
    expect(pageAfterSwipe(1, 4, -0.15, 1200)).toBe(0);
  });

  it('stays on a short, slow drag, and on a flick too short to mean it', () => {
    expect(pageAfterSwipe(1, 4, 0.3, -100)).toBe(1);
    expect(pageAfterSwipe(1, 4, 0.05, -1200)).toBe(1);
  });

  it('stays when a long drag ends with a flick back', () => {
    expect(pageAfterSwipe(1, 4, 0.6, 1200)).toBe(1);
  });

  it('turns one page at most, and has nothing past either end', () => {
    expect(pageAfterSwipe(1, 4, 1.8, 0)).toBe(2);
    expect(pageAfterSwipe(0, 4, -0.5, 0)).toBe(0);
    expect(pageAfterSwipe(3, 4, 0.5, 0)).toBe(3);
  });
});

describe('dragPosition', () => {
  it('follows the finger one to one between the ends', () => {
    expect(dragPosition(1, 4, -100, 400)).toBeCloseTo(1.25);
    expect(dragPosition(1, 4, 200, 400)).toBeCloseTo(0.5);
  });

  it('resists past either end', () => {
    expect(dragPosition(0, 4, 200, 400)).toBeCloseTo(-0.125);
    expect(dragPosition(3, 4, -200, 400)).toBeCloseTo(3.125);
  });
});

describe('Pager', () => {
  function renderPager(index: number, onIndexChange = jest.fn()) {
    return render(
      <Pager
        index={index}
        count={PAGES.length}
        onIndexChange={onIndexChange}
        renderPage={(page) => <Text>{PAGES[page]}</Text>}
      />,
    );
  }

  it('shows only the current page, with its neighbours drawn but hidden', async () => {
    await renderPager(1);

    expect(screen.getByText('Balances')).toBeTruthy();
    expect(screen.queryByText('Transactions')).toBeNull();
    expect(screen.getByText('Transactions', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Statistics', { includeHiddenElements: true })).toBeTruthy();
    // Two pages away: not drawn until it comes near.
    expect(screen.queryByText('Manage', { includeHiddenElements: true })).toBeNull();
  });

  it('asks for the page a swipe settles on', async () => {
    const onIndexChange = jest.fn();
    await renderPager(1, onIndexChange);

    await swipe(-0.6);
    expect(onIndexChange).toHaveBeenLastCalledWith(2);
  });

  it('asks for nothing when a swipe falls short, or goes past the last page', async () => {
    const onIndexChange = jest.fn();
    await renderPager(3, onIndexChange);

    await swipe(0.2);
    await swipe(-0.8);

    expect(onIndexChange).not.toHaveBeenCalled();
  });

  it('draws every page a jump passes through', async () => {
    const view = await renderPager(0);
    await view.rerender(
      <Pager
        index={3}
        count={PAGES.length}
        onIndexChange={jest.fn()}
        renderPage={(page) => <Text>{PAGES[page]}</Text>}
      />,
    );

    expect(screen.getByText('Manage')).toBeTruthy();
    expect(screen.getByText('Statistics', { includeHiddenElements: true })).toBeTruthy();
  });
});
