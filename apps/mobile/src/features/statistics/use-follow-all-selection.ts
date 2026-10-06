import { useMemo, useState } from 'react';

type Update = ReadonlySet<string> | ((current: ReadonlySet<string>) => ReadonlySet<string>);

/**
 * A selection among `ids` — the group's members, or its sub-groups — that
 * starts with every one selected and keeps up with `ids` changing while the
 * screen stays mounted (the statistics tab is kept alive in the pager):
 *
 * - while everything is selected, an id that appears later (a member who
 *   joins, a sub-group just created) is selected too, so "Everybody" / "All"
 *   stays true;
 * - a hand-picked selection keeps its picks: a newcomer shows unticked;
 * - an id that disappears drops out of the selection.
 */
export function useFollowAllSelection(
  ids: readonly string[],
): [ReadonlySet<string>, (update: Update) => void] {
  const [picked, setPicked] = useState<ReadonlySet<string> | 'all'>('all');
  const key = ids.join('\n');

  const selected = useMemo<ReadonlySet<string>>(
    () => (picked === 'all' ? new Set(ids) : new Set(ids.filter((id) => picked.has(id)))),
    // `key` stands for `ids`: a new array with the same ids is no change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [picked, key],
  );

  function update(next: Update) {
    const value = typeof next === 'function' ? next(selected) : next;
    setPicked(ids.every((id) => value.has(id)) ? 'all' : value);
  }

  return [selected, update];
}
