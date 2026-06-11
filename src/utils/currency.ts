/**
 * Global Currency Engine utilities
 */

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/**
 * Formats a raw number to US Dollar (USD) currency format with zero decimal places.
 * e.g., 1000000 -> "$1,000,000"
 */
export function formatUSD(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return "$0";
  }
  return usdFormatter.format(value);
}
