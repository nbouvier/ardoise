import type { Transaction } from '@ardoise/shared';
import { describe, expect, it } from '@jest/globals';

import { transaction } from '@/test-utils/api-fakes';

import { upsertInto, type TransactionPages } from './use-transactions';

/** A transaction on `day` of September 2026, named by its id. */
const on = (id: string, day: number): Transaction => {
  const date = `2026-09-${String(day).padStart(2, '0')}`;
  return { ...transaction, id, occurredOn: date, createdAt: `${date}T12:00:00.000Z` };
};

/** The loaded pages, as ids. */
const ids = (data: TransactionPages) =>
  data.pages.map((page) => page.transactions.map((t) => t.id));

/** Two pages loaded: days 20 and 15, then 10 and 5. */
const loaded: TransactionPages = {
  pages: [
    { transactions: [on('d20', 20), on('d15', 15)], nextCursor: 'page-2' },
    { transactions: [on('d10', 10), on('d5', 5)], nextCursor: 'page-3' },
  ],
  pageParams: [null, 'page-2'],
};

describe('upsertInto', () => {
  it('puts a newer transaction at the top of the first page', () => {
    expect(ids(upsertInto(loaded, on('d25', 25), true))).toEqual([
      ['d25', 'd20', 'd15'],
      ['d10', 'd5'],
    ]);
  });

  it('moves an edited transaction to the page its new date belongs in', () => {
    // `d20`, now dated the 7th.
    expect(ids(upsertInto(loaded, on('d20', 7), true))).toEqual([['d15'], ['d10', 'd20', 'd5']]);
  });

  it('leaves out one older than everything loaded while more remain to load', () => {
    expect(ids(upsertInto(loaded, on('d20', 1), true))).toEqual([['d15'], ['d10', 'd5']]);
  });

  it('puts it at the end of the last page once everything is loaded', () => {
    expect(ids(upsertInto(loaded, on('d1', 1), false))).toEqual([
      ['d20', 'd15'],
      ['d10', 'd5', 'd1'],
    ]);
  });

  it('keeps the cursors the pages were read with', () => {
    expect(upsertInto(loaded, on('d25', 25), true).pageParams).toEqual(loaded.pageParams);
  });
});
