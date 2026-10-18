import {
  editorText,
  formFromReceipt,
  isValidIsoDate,
  missingFields,
  todayIso,
  validateReview,
  type ReviewForm,
} from '@/lib/review';

const CATEGORIES = ['Groceries', 'Food & Drink', 'Other'];
const valid: ReviewForm = {
  vendor: 'Green Supermarket',
  date: '2026-07-28',
  total: '27.35',
  currency: 'usd',
  category: 'Groceries',
};

describe('formFromReceipt / missingFields', () => {
  it('turns nulls from extraction into empty, highlighted fields', () => {
    const form = formFromReceipt({
      vendor: 'Green Supermarket',
      date: null,
      totalAmount: 27.35,
      currency: null,
      category: 'Groceries',
    });
    expect(form.total).toBe('27.35');
    expect([...missingFields(form)].sort()).toEqual(['currency', 'date']);
  });
});

describe('validateReview', () => {
  it('normalizes a valid form', () => {
    const result = validateReview(valid, CATEGORIES);
    expect(result).toEqual({
      ok: true,
      value: {
        vendor: 'Green Supermarket',
        date: '2026-07-28',
        totalAmount: 27.35,
        currency: 'USD',
        category: 'Groceries',
      },
    });
  });

  it('accepts thousands separators in the total', () => {
    const result = validateReview({ ...valid, total: '1,234.50' }, CATEGORIES);
    expect(result.ok && result.value.totalAmount).toBe(1234.5);
  });

  it('reports every invalid field', () => {
    const result = validateReview(
      { vendor: ' ', date: '28/07/2026', total: 'abc', currency: 'dollars', category: 'Rent' },
      CATEGORIES,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual([
        'category',
        'currency',
        'date',
        'total',
        'vendor',
      ]);
    }
  });

  it('skips the category check while categories are unknown (offline)', () => {
    expect(validateReview({ ...valid, category: 'Anything' }, []).ok).toBe(true);
  });
});

describe('dates', () => {
  it.each([
    ['2026-07-28', true],
    ['2024-02-29', true],
    ['2026-02-30', false],
    ['2026-7-28', false],
    ['', false],
  ])('isValidIsoDate(%p) is %p', (value, expected) => {
    expect(isValidIsoDate(value)).toBe(expected);
  });

  it('formats today in local time', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('editorText', () => {
  it('reviews a fresh scan and edits a saved receipt', () => {
    expect(editorText('draft')).toMatchObject({ title: 'Review receipt', remove: 'Discard' });
    expect(editorText('saved')).toMatchObject({ title: 'Edit receipt', remove: 'Delete' });
  });
});
