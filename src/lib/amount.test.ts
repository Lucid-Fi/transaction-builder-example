import { describe, expect, it } from "vitest";
import { AMOUNT_PATTERN } from "./amount";

// Browsers compile `pattern` this way.
const browser = new RegExp(`^(?:${AMOUNT_PATTERN})$`, "v");

describe("AMOUNT_PATTERN", () => {
  it.each(["0.5", "10", "10.123456"])("accepts %j", (v) => {
    expect(browser.test(v)).toBe(true);
  });

  it.each(["01", "00.5", "1.", ".5", "1.1234567", " 1"])("rejects %j", (v) => {
    expect(browser.test(v)).toBe(false);
  });
});
