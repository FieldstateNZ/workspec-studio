// Shared monthly-amount currency formatting — one `Intl.NumberFormat` cache
// keyed by currency code, reused by the canvas cost pill (`overlays.tsx`),
// the Cost view's side panel, and a selected node's cost detail box, so a
// "$1,470" reads identically everywhere it appears.

const CURRENCY_FORMAT_CACHE = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string): Intl.NumberFormat {
  let formatter = CURRENCY_FORMAT_CACHE.get(currency);
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    });
    CURRENCY_FORMAT_CACHE.set(currency, formatter);
  }
  return formatter;
}

/** Formats a monthly amount in `currency` (ISO 4217, e.g. "NZD"), e.g. `formatMonthly(1470, 'NZD')` → `"$1,470"`. */
export function formatMonthly(amount: number, currency: string): string {
  return formatterFor(currency).format(amount);
}
