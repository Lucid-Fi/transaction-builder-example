// Unanchored, for the HTML `pattern` attribute; matches tx-builder's amount format.
export const AMOUNT_PATTERN = String.raw`(0|[1-9]\d*)(\.\d{1,6})?`;

const AMOUNT = new RegExp(`^(?:${AMOUNT_PATTERN})$`);

export const isAmount = (v: unknown): boolean => typeof v === "string" && AMOUNT.test(v) && /[1-9]/.test(v);
