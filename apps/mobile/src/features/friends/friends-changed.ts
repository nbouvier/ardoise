/**
 * A bump counter announcing that the friend list changed somewhere other than
 * the list itself — accepting an invitation from the confirmation modal, which
 * is mounted outside the Friends tab. `useFriends` reloads when it changes.
 *
 * Deliberately not a cache: the server stays the source of truth, this only
 * says "ask again".
 */
let version = 0;
const listeners = new Set<() => void>();

export const friendsChanged = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot(): number {
    return version;
  },

  notify(): void {
    version += 1;
    for (const listener of listeners) {
      listener();
    }
  },
};
