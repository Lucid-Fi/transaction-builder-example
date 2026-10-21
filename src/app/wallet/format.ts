// Pact money values are decimal strings. Intl.NumberFormat formats numeric strings exactly (no float drift).
const DECIMAL = /^-?\d+(\.\d+)?$/;

function fmt(value: string | null | undefined, options: Intl.NumberFormatOptions): string {
  if (!value) return "—";
  return DECIMAL.test(value) ? new Intl.NumberFormat("en-US", options).format(value as `${number}`) : value;
}

// "negative": a tiny loss that rounds to zero shows "$0.00", not "-$0.00".
export const money = (value: string | null | undefined, currency = "USD") =>
  fmt(value, { style: "currency", currency, signDisplay: "negative" });
export const tokens = (value: string | null | undefined) => fmt(value, { maximumFractionDigits: 6 });
/** APY values are fractions: "0.05" → "5%". */
export const percent = (value: string | null | undefined) =>
  fmt(value, { style: "percent", maximumFractionDigits: 2 });
export const short = (hex: string) => (hex.length > 12 ? `${hex.slice(0, 6)}…${hex.slice(-4)}` : hex);
