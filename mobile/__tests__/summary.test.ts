import { formatMonth, monthKey, shiftMonth, summarize } from '@/lib/summary';

import { makeReceipt } from '../test-utils/make-receipt';

describe('month helpers', () => {
  it('builds a YYYY-MM key in local time', () => {
    expect(monthKey(new Date(2026, 0, 31, 23, 59))).toBe('2026-01');
    expect(monthKey(new Date(2026, 9, 1))).toBe('2026-10');
  });

  it('shifts across year boundaries', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2025-12', 1)).toBe('2026-01');
    expect(shiftMonth('2026-10', 0)).toBe('2026-10');
  });

  it('formats a month for display', () => {
    expect(formatMonth('2026-10', 'en-US')).toBe('October 2026');
  });
});

describe('summarize', () => {
  const receipts = [
    makeReceipt({ id: '1', date: '2026-10-03', totalAmount: 30, category: 'Groceries' }),
    makeReceipt({ id: '2', date: '2026-10-20', totalAmount: 10, category: 'Food & Drink' }),
    makeReceipt({ id: '3', date: '2026-10-21', totalAmount: 60, category: 'Groceries' }),
    makeReceipt({ id: '4', date: '2026-10-09', totalAmount: 15, currency: 'EUR', category: 'Travel' }),
    makeReceipt({ id: '5', date: '2026-09-30', totalAmount: 999, category: 'Groceries' }),
    makeReceipt({ id: '6', date: null, totalAmount: 999, category: 'Groceries' }),
  ];

  it('groups one month by currency, categories largest first', () => {
    expect(summarize(receipts, '2026-10')).toEqual([
      {
        currency: 'USD',
        total: 100,
        count: 3,
        categories: [
          { category: 'Groceries', total: 90, count: 2, share: 0.9 },
          { category: 'Food & Drink', total: 10, count: 1, share: 0.1 },
        ],
      },
      {
        currency: 'EUR',
        total: 15,
        count: 1,
        categories: [{ category: 'Travel', total: 15, count: 1, share: 1 }],
      },
    ]);
  });

  it('is empty for a month with no receipts', () => {
    expect(summarize(receipts, '2026-11')).toEqual([]);
  });
});
