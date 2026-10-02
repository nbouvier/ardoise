import { jest } from '@jest/globals';
import { act } from '@testing-library/react-native';
import { BackHandler } from 'react-native';

/**
 * Stands in for Android's back button, which `BackHandler` does nothing with
 * under jest: the listeners it is given, asked last-registered first, stopping
 * at the first that consumes the press. `pressBack` reports whether something
 * did — if not, the real one would go on to pop the route. Pair with
 * `jest.restoreAllMocks()` in `afterEach`.
 */
export function mockBackButton(): () => Promise<boolean> {
  type Listener = Parameters<typeof BackHandler.addEventListener>[1];
  const listeners: Listener[] = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, listener) => {
    listeners.push(listener);
    return {
      remove: () => {
        listeners.splice(listeners.indexOf(listener), 1);
      },
    };
  });

  return async function pressBack() {
    let consumed = false;
    await act(async () => {
      for (const listener of [...listeners].reverse()) {
        // The listeners under test never read the event.
        if (listener({} as Parameters<Listener>[0])) {
          consumed = true;
          break;
        }
      }
    });
    return consumed;
  };
}
