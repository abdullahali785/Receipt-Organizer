/** Pure month math and per-month totals for the Summary tab. */
import type { Receipt } from '@/db/receipts';
import { totalsByCurrency } from '@/lib/table';

/** 'YYYY-MM' for a date in local time. */
export function monthKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Moves a 'YYYY-MM' key by `delta` months (negative goes back). */
export function shiftMonth(key: string, delta: number): string {
  const [year, month] = key.split('-').map(Number);
  return monthKey(new Date(year, month - 1 + delta, 1));
}

/** 'YYYY-MM' → e.g. 'October 2026'. */
export function formatMonth(key: string, locale?: string): string {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  });
}

export type CategoryTotal = { category: string; total: number; count: number; share: number };
export type CurrencySummary = {
  currency: string | null;
  total: number;
  count: number;
  categories: CategoryTotal[];
};

/** Totals for one month, split by currency, with categories largest first. */
export function summarize(receipts: readonly Receipt[], month: string): CurrencySummary[] {
  const inMonth = receipts.filter((r) => r.date?.startsWith(`${month}-`));

  return totalsByCurrency(inMonth).map(({ currency, total, count }) => {
    const byCategory = new Map<string, Receipt[]>();
    for (const r of inMonth.filter((r) => r.currency === currency)) {
      byCategory.set(r.category, [...(byCategory.get(r.category) ?? []), r]);
    }
    const categories = [...byCategory.entries()]
      .map(([category, rs]) => {
        const [sum] = totalsByCurrency(rs);
        return { category, total: sum.total, count: sum.count, share: total > 0 ? sum.total / total : 0 };
      })
      .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));
    return { currency, total, count, categories };
  });
}
