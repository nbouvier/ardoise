/**
 * A bump counter announcing that server-owned data changed somewhere other than
 * the screen showing it — accepting an invitation from the confirmation modal,
 * which is mounted outside the tabs, or leaving a group from its detail screen.
 *
 * Deliberately not a cache: the server stays the source of truth, this only
 * says "ask again". Shaped for `useSyncExternalStore`.
 */
export interface ChangeSignal {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => number;
  notify: () => void;
}

export function createChangeSignal(): ChangeSignal {
  let version = 0;
  const listeners = new Set<() => void>();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getSnapshot() {
      return version;
    },

    notify() {
      version += 1;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}
