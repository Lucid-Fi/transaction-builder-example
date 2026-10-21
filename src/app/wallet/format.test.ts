import { expect, it } from "vitest";
import { money, percent } from "./format";

it("percent formats APY fractions", () => expect(percent("0.05")).toBe("5%"));

it("money drops the sign when a value rounds to zero", () => {
  expect(money("-0.000115")).toBe("$0.00");
  expect(money("-1.5")).toBe("-$1.50");
  expect(money("99")).toBe("$99.00");
});
