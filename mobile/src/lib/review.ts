/** Pure form logic for the Review screen: what's missing, and what's valid. */

export type ReviewForm = {
  vendor: string;
  date: string;
  total: string;
  currency: string;
  category: string;
};

export type ReviewField = keyof ReviewForm;
export type FieldErrors = Partial<Record<ReviewField, string>>;

export type ReviewedReceipt = {
  vendor: string;
  date: string;
  totalAmount: number;
  currency: string;
  category: string;
};

export function formFromReceipt(r: {
  vendor: string | null;
  date: string | null;
  totalAmount: number | null;
  currency: string | null;
  category: string;
}): ReviewForm {
  return {
    vendor: r.vendor ?? '',
    date: r.date ?? '',
    total: r.totalAmount === null ? '' : r.totalAmount.toFixed(2),
    currency: r.currency ?? '',
    category: r.category,
  };
}

/** Fields the user still needs to fill in; the UI highlights these. */
export function missingFields(form: ReviewForm): Set<ReviewField> {
  return new Set(
    (Object.keys(form) as ReviewField[]).filter((key) => form[key].trim() === ''),
  );
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateReview(
  form: ReviewForm,
  categories: string[],
): { ok: true; value: ReviewedReceipt } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const vendor = form.vendor.trim();
  const date = form.date.trim();
  const currency = form.currency.trim().toUpperCase();
  const totalText = form.total.trim().replace(/,/g, '');
  const totalAmount = Number(totalText);

  if (!vendor) errors.vendor = 'Enter the vendor.';
  if (!isValidIsoDate(date)) errors.date = 'Use YYYY-MM-DD, e.g. 2026-07-28.';
  if (!totalText || !Number.isFinite(totalAmount)) errors.total = 'Enter the total, e.g. 27.35.';
  if (!/^[A-Z]{3}$/.test(currency)) errors.currency = 'Use a 3-letter code, e.g. USD.';
  if (!form.category || (categories.length > 0 && !categories.includes(form.category))) {
    errors.category = 'Pick a category.';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      vendor,
      date,
      totalAmount: Math.round(totalAmount * 100) / 100,
      currency,
      category: form.category,
    },
  };
}

/** Screen wording: a fresh scan is reviewed then saved or discarded; a saved receipt is edited or deleted. */
export function editorText(status: 'draft' | 'saved') {
  return status === 'saved'
    ? {
        title: 'Edit receipt',
        save: 'Save changes',
        remove: 'Delete',
        confirmTitle: 'Delete this receipt?',
        confirmMessage: "This can't be undone.",
        keep: 'Cancel',
      }
    : {
        title: 'Review receipt',
        save: 'Save receipt',
        remove: 'Discard',
        confirmTitle: 'Discard this receipt?',
        confirmMessage: 'It will not be saved.',
        keep: 'Keep editing',
      };
}

export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
