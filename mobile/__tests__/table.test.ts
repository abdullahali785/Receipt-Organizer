import { DEFAULT_SORT, nextSort, sortReceipts, totalsByCurrency } from '@/lib/table';

import { makeReceipt } from '../test-utils/make-receipt';

const receipts = [
  makeReceipt({ id: 'a', vendor: 'bakery', date: '2026-10-02', totalAmount: 5, category: 'Food' }),
  makeReceipt({ id: 'b', vendor: 'Apple', date: '2026-10-05', totalAmount: 120, category: 'Tech' }),
  makeReceipt({ id: 'c', vendor: null, date: null, totalAmount: null, category: 'Other' }),
  makeReceipt({ id: 'd', vendor: 'Cafe', date: '2026-09-30', totalAmount: 7.5, category: 'Food' }),
];
const ids = (rs: { id: string }[]) => rs.map((r) => r.id);

describe('nextSort', () => {
  it('starts on date, newest first', () => {
    expect(DEFAULT_SORT).toEqual({ key: 'date', dir: 'desc' });
  });

  it('flips direction when the same column is tapped', () => {
    expect(nextSort({ key: 'date', dir: 'desc' }, 'date')).toEqual({ key: 'date', dir: 'asc' });
    expect(nextSort({ key: 'vendor', dir: 'asc' }, 'vendor')).toEqual({ key: 'vendor', dir: 'desc' });
  });

  it.each([
    ['total', 'desc'],
    ['date', 'desc'],
    ['vendor', 'asc'],
    ['category', 'asc'],
  ] as const)('a new %s column starts %s', (key, dir) => {
    const current = { key: key === 'date' ? 'vendor' : 'date', dir: 'asc' } as const;
    expect(nextSort(current, key)).toEqual({ key, dir });
  });
});

describe('sortReceipts', () => {
  it('sorts dates and totals, keeping empty values last in both directions', () => {
    expect(ids(sortReceipts(receipts, { key: 'date', dir: 'desc' }))).toEqual(['b', 'a', 'd', 'c']);
    expect(ids(sortReceipts(receipts, { key: 'date', dir: 'asc' }))).toEqual(['d', 'a', 'b', 'c']);
    expect(ids(sortReceipts(receipts, { key: 'total', dir: 'desc' }))).toEqual(['b', 'd', 'a', 'c']);
    expect(ids(sortReceipts(receipts, { key: 'total', dir: 'asc' }))).toEqual(['a', 'd', 'b', 'c']);
  });

  it('sorts text case-insensitively', () => {
    expect(ids(sortReceipts(receipts, { key: 'vendor', dir: 'asc' }))).toEqual(['b', 'a', 'd', 'c']);
  });

  it('keeps input order for ties and does not mutate the input', () => {
    const copy = [...receipts];
    expect(ids(sortReceipts(receipts, { key: 'category', dir: 'asc' }))).toEqual(['a', 'd', 'c', 'b']);
    expect(receipts).toEqual(copy);
  });
});

describe('totalsByCurrency', () => {
  it('sums per currency without floating-point drift', () => {
    const rs = [
      makeReceipt({ id: '1', totalAmount: 0.1 }),
      makeReceipt({ id: '2', totalAmount: 0.2 }),
      makeReceipt({ id: '3', totalAmount: 50, currency: 'EUR' }),
      makeReceipt({ id: '4', totalAmount: 1.25 }),
    ];
    expect(totalsByCurrency(rs)).toEqual([
      { currency: 'USD', total: 1.55, count: 3 },
      { currency: 'EUR', total: 50, count: 1 },
    ]);
  });

  it('is empty for no receipts', () => {
    expect(totalsByCurrency([])).toEqual([]);
  });
});
