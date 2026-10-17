export function formatMoney(amount: number | null, currency: string | null): string {
  if (amount === null) return '—';
  if (currency && /^[A-Z]{3}$/.test(currency)) {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
    } catch {
      // Unknown currency code: fall through to plain formatting.
    }
  }
  return amount.toFixed(2) + (currency ? ` ${currency}` : '');
}
