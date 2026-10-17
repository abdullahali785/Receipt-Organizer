import { CategoriesResponseSchema, ExtractResponseSchema } from '@/api/schemas';

import liveResponse from './fixtures/extract-response.json';

// The fixture is a real /v1/extract response (trimmed line items).
describe('ExtractResponseSchema', () => {
  it('accepts a real backend response', () => {
    const parsed = ExtractResponseSchema.parse(liveResponse);
    expect(parsed.receipt.vendor).toBe('Green Supermarket');
    expect(parsed.receipt.date).toBeNull();
  });

  it('rejects a response missing required fields', () => {
    const { needs_review, ...rest } = liveResponse.receipt;
    expect(ExtractResponseSchema.safeParse({ receipt: rest }).success).toBe(false);
  });

  it('rejects an unknown category source', () => {
    const bad = { receipt: { ...liveResponse.receipt, category_source: 'magic' } };
    expect(ExtractResponseSchema.safeParse(bad).success).toBe(false);
  });
});

describe('CategoriesResponseSchema', () => {
  it('requires at least one category', () => {
    expect(CategoriesResponseSchema.safeParse({ categories: [], default: 'Other' }).success).toBe(
      false,
    );
  });
});
