import { describe, expect, it } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Dimensions, Text } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import AppTabs from './app-tabs';

function renderTabs() {
  return renderRouter(
    {
      '(tabs)/_layout': AppTabs,
      '(tabs)/index': () => <Text>Home page</Text>,
      '(tabs)/groups': () => <Text>Groups page</Text>,
      '(tabs)/friends': () => <Text>Friends page</Text>,
      '(tabs)/account': () => <Text>Account page</Text>,
    },
    { initialUrl: '/' },
  );
}

const selected = (name: string) =>
  screen.getByRole('tab', { name }).props.accessibilityState.selected;

describe('the bottom tabs', () => {
  it('opens on Home, with its neighbour drawn but hidden', async () => {
    await renderTabs();

    expect(screen.getByText('Home page')).toBeTruthy();
    expect(selected('Home')).toBe(true);
    expect(screen.queryByText('Groups page')).toBeNull();
    expect(screen.getByText('Groups page', { includeHiddenElements: true })).toBeTruthy();
  });

  it('goes to a tab when it is tapped', async () => {
    await renderTabs();

    await act(async () => fireEvent.press(screen.getByRole('tab', { name: 'Friends' })));

    expect(screen.getByText('Friends page')).toBeTruthy();
    expect(selected('Friends')).toBe(true);
  });

  it('goes to the next tab on a swipe', async () => {
    await renderTabs();

    await act(async () => {
      fireGestureHandler(getByGestureTestId('pager'), [
        { state: State.BEGAN, translationX: 0 },
        { state: State.ACTIVE, translationX: -200 },
        { state: State.END, translationX: -0.6 * Dimensions.get('window').width },
      ]);
    });

    expect(await screen.findByText('Groups page')).toBeTruthy();
    expect(selected('Groups')).toBe(true);
  });
});
