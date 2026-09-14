/**
 * Reorders `items` to match `previousOrder` wherever possible, instead of
 * trusting the order a fresh fetch happened to return. A silent background
 * refresh (`groupsChanged`, `friendsChanged`) must not move a row the viewer
 * did not ask to move — reordering under someone's finger reads as
 * disorienting (`docs/specs/favorites.md`). An id already in `previousOrder`
 * keeps its relative position; one that is not (a group just created or
 * joined elsewhere) is appended at the end, in the order the fresh data
 * lists it.
 */
export function preserveOrder<T>(
  previousOrder: readonly string[],
  items: readonly T[],
  idOf: (item: T) => string,
): T[] {
  const byId = new Map(items.map((item) => [idOf(item), item] as const));
  const known = previousOrder
    .map((id) => byId.get(id))
    .filter((item): item is T => item !== undefined);
  const knownIds = new Set(previousOrder);
  const fresh = items.filter((item) => !knownIds.has(idOf(item)));
  return [...known, ...fresh];
}
