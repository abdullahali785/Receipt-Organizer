import { csvFileName, escapeCsv, neutralizeFormula, receiptsToCsv } from '@/lib/csv';

import { makeReceipt } from '../test-utils/make-receipt';

describe('escapeCsv', () => {
  it.each([
    ['plain', 'plain'],
    ['Joe, Inc.', '"Joe, Inc."'],
    ['The "Best" Cafe', '"The ""Best"" Cafe"'],
    ['two\nlines', '"two\nlines"'],
  ])('%p → %p', (value, expected) => {
    expect(escapeCsv(value)).toBe(expected);
  });
});

describe('neutralizeFormula', () => {
  it('keeps text that a spreadsheet would run as a formula as plain text', () => {
    expect(neutralizeFormula('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(neutralizeFormula('+1 Store')).toBe("'+1 Store");
    expect(neutralizeFormula('@home')).toBe("'@home");
    expect(neutralizeFormula('Starbucks')).toBe('Starbucks');
  });
});

describe('receiptsToCsv', () => {
  it('writes a header plus one row per receipt, with a UTF-8 BOM and CRLF line ends', () => {
    const csv = receiptsToCsv([
      makeReceipt({
        id: 'r1',
        date: '2026-10-03',
        vendor: 'Café, "Nice"',
        category: 'Food & Drink',
        totalAmount: 4.5,
        currency: 'EUR',
      }),
      makeReceipt({
        id: 'r2',
        vendor: '=cmd',
        totalAmount: -12,
        needsReview: true,
        reviewReason: 'Total unclear',
      }),
    ]);

    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.slice(1).split('\r\n')).toEqual([
      'Date,Vendor,Category,Total,Currency,Needs review,Review note,ID',
      '2026-10-03,"Café, ""Nice""",Food & Drink,4.50,EUR,no,,r1',
      "2026-10-01,'=cmd,Other,-12.00,USD,yes,Total unclear,r2",
      '',
    ]);
  });

  it('leaves missing values empty', () => {
    const csv = receiptsToCsv([
      makeReceipt({ id: 'x', date: null, vendor: null, totalAmount: null, currency: null }),
    ]);
    expect(csv.split('\r\n')[1]).toBe(',,Other,,,no,,x');
  });
});

it('names the file after the local date', () => {
  expect(csvFileName(new Date(2026, 0, 5))).toBe('receipts-2026-01-05.csv');
});
