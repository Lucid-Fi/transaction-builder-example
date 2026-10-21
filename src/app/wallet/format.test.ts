import { expect, it } from "vitest";
import { percent } from "./format";

it("percent formats APY fractions", () => expect(percent("0.05")).toBe("5%"));
