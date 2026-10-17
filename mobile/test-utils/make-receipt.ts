import type { Receipt } from '@/db/receipts';

/** A saved receipt with sensible defaults; override only what a test cares about. */
export function makeReceipt(overrides: Partial<Receipt> & { id: string }): Receipt {
  return {
    status: 'saved',
    vendor: 'Vendor',
    date: '2026-10-01',
    totalAmount: 10,
    currency: 'USD',
    category: 'Other',
    categorySource: 'rules',
    lineItems: [],
    confidence: 'high',
    needsReview: false,
    reviewReason: null,
    imageUri: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}
