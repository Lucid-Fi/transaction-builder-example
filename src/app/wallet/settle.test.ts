import { redirect } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import type { DepositStatus } from "./actions";
import { settle } from "./settle";

const ok = (status: string, terminal = false): DepositStatus => ({
  id: "tx-1",
  status,
  expires_at: 0,
  transaction_hash: terminal ? "0xhash" : null,
  failure_reason: null,
  terminal,
});
const opts = () => ({ deadline: Date.now() + 60_000, wait: async () => true, onStep: () => {} });

describe("settle", () => {
  it("repeats submit while the outcome is unknown, then polls to a terminal status", async () => {
    const submit = vi
      .fn()
      .mockResolvedValueOnce({ error: "bad gateway", status: 502 })
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce({ error: "no response", status: 0 })
      .mockResolvedValueOnce({ error: "slow down", status: 429 })
      .mockResolvedValueOnce(ok("submitted"));
    const poll = vi
      .fn()
      .mockResolvedValueOnce({ error: "unavailable", status: 503 })
      .mockResolvedValueOnce(ok("confirmed", true));
    await expect(settle(submit, poll, opts())).resolves.toMatchObject({ status: "confirmed" });
    expect(submit).toHaveBeenCalledTimes(5);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it.each([409, undefined])("a final submit error (status %s) ends the flow without polling", async (status) => {
    const poll = vi.fn();
    await expect(settle(async () => ({ error: "build expired", status }), poll, opts())).rejects.toThrow("build expired");
    expect(poll).not.toHaveBeenCalled();
  });

  it("a 4xx while polling stops and says the deposit may still land", async () => {
    const poll = async () => ({ error: "not found", status: 404 });
    await expect(settle(async () => ok("submitted"), poll, opts())).rejects.toThrow(/may still land/);
  });

  it("times out with the last error when submit never answers", async () => {
    const submit = async () => ({ error: "upstream unavailable", status: 502 });
    await expect(settle(submit, vi.fn(), { ...opts(), deadline: 0 })).rejects.toThrow(
      "Timed out waiting for the deposit (last status: unknown; last error: upstream unavailable).",
    );
  });

  it("lets a redirect from the Server Action through instead of retrying", async () => {
    let redirectError: unknown;
    try {
      redirect("/login");
    } catch (err) {
      redirectError = err;
    }
    const submit = vi.fn().mockRejectedValue(redirectError);
    await expect(settle(submit, vi.fn(), opts())).rejects.toBe(redirectError);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("returns null when the form unmounts", async () => {
    const poll = vi.fn();
    await expect(settle(async () => ok("submitted"), poll, { ...opts(), wait: async () => false })).resolves.toBeNull();
    expect(poll).not.toHaveBeenCalled();
  });
});
