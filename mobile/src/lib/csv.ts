/** Pure CSV building for exporting saved receipts (RFC 4180, opens in Excel/Sheets/Numbers). */
import type { Receipt } from '@/db/receipts';

const HEADER = ['Date', 'Vendor', 'Category', 'Total', 'Currency', 'Needs review', 'Review note', 'ID'];

/** Quotes a field when it contains a comma, quote or line break; doubles inner quotes. */
export function escapeCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Text a spreadsheet would run as a formula (e.g. a vendor read as "=HYPERLINK(...)")
 * gets a leading apostrophe so it stays plain text. Numbers never go through this. */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

const text = (value: string | null) => escapeCsv(neutralizeFormula(value ?? ''));

export function receiptsToCsv(receipts: readonly Receipt[]): string {
  const rows = receipts.map((r) => [
    text(r.date),
    text(r.vendor),
    text(r.category),
    r.totalAmount === null ? '' : r.totalAmount.toFixed(2),
    text(r.currency),
    r.needsReview ? 'yes' : 'no',
    text(r.reviewReason),
    r.id,
  ]);
  // The byte-order mark makes Excel read the file as UTF-8 (e.g. "Café" stays intact).
  return '﻿' + [HEADER, ...rows].map((row) => row.join(',')).join('\r\n') + '\r\n';
}

/** e.g. receipts-2026-10-18.csv, in local time. */
export function csvFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `receipts-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.csv`;
}
