/** Pure sorting and totals for the Records table. */
import type { Receipt } from '@/db/receipts';

export type SortKey = 'date' | 'vendor' | 'category' | 'total';
export type SortDir = 'asc' | 'desc';
export type Sort = { key: SortKey; dir: SortDir };

export const DEFAULT_SORT: Sort = { key: 'date', dir: 'desc' };

/** Numbers and dates start newest/largest first; text starts A→Z. */
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  date: 'desc',
  total: 'desc',
  vendor: 'asc',
  category: 'asc',
};

/** Tapping the active column flips it; tapping another column starts at its default. */
export function nextSort(current: Sort, key: SortKey): Sort {
  if (current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: DEFAULT_DIR[key] };
}

function sortValue(r: Receipt, key: SortKey): string | number | null {
  switch (key) {
    case 'date':
      return r.date;
    case 'vendor':
      return r.vendor;
    case 'category':
      return r.category;
    case 'total':
      return r.totalAmount;
  }
}

/** Returns a sorted copy. Empty values always go last; ties keep their input order. */
export function sortReceipts(receipts: readonly Receipt[], sort: Sort): Receipt[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...receipts].sort((a, b) => {
    const x = sortValue(a, sort.key);
    const y = sortValue(b, sort.key);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    if (typeof x === 'number' && typeof y === 'number') return sign * (x - y);
    return sign * String(x).localeCompare(String(y), undefined, { sensitivity: 'base' });
  });
}

export type CurrencyTotal = { currency: string | null; total: number; count: number };

/** Sum of each currency's totals, rounded to 2 decimals, most-used currency first. */
export function totalsByCurrency(receipts: readonly Receipt[]): CurrencyTotal[] {
  const cents = new Map<string | null, { cents: number; count: number }>();
  for (const r of receipts) {
    const entry = cents.get(r.currency) ?? { cents: 0, count: 0 };
    entry.cents += Math.round((r.totalAmount ?? 0) * 100);
    entry.count += 1;
    cents.set(r.currency, entry);
  }
  return [...cents.entries()]
    .map(([currency, e]) => ({ currency, total: e.cents / 100, count: e.count }))
    .sort((a, b) => b.count - a.count || (a.currency ?? '').localeCompare(b.currency ?? ''));
}
