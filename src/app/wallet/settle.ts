import { unstable_rethrow } from "next/navigation";
import type { DepositStatus } from "./actions";

type Answer = DepositStatus | { error: string; status?: number };

// No response, 429 or 5xx: the server may or may not have acted. Any other error is final.
const unknown = (status?: number) => status === 0 || status === 429 || (status ?? 0) >= 500;

/**
 * Drives a signed deposit to a terminal status. Repeats `submit` with the same signature until it
 * answers (tx-builder returns the current state on a repeat), then polls. Returns null if `wait`
 * reports the form went away.
 */
export async function settle(
  submit: () => Promise<Answer>,
  poll: () => Promise<Answer>,
  { deadline, wait, onStep }: { deadline: number; wait: () => Promise<boolean>; onStep: (step: string) => void },
): Promise<DepositStatus | null> {
  let tx: DepositStatus | null = null;
  for (;;) {
    let next: Answer = { error: "no response", status: 0 };
    try {
      next = await (tx ? poll() : submit());
    } catch (err) {
      unstable_rethrow(err); // a redirect (session expired) navigates
    }
    const failed = "error" in next;
    if (!("error" in next)) tx = next;
    else if (!unknown(next.status)) {
      throw new Error(tx ? `${next.error} The deposit may still land; check Activity before depositing again.` : next.error);
    }
    onStep(tx ? `Status: ${tx.status}${failed ? " (status check failed, retrying…)" : ""}` : "Submit outcome unknown, retrying…");
    if (tx?.terminal) return tx;
    if (Date.now() > deadline) {
      const last = `last status: ${tx?.status ?? "unknown"}${"error" in next ? `; last error: ${next.error}` : ""}`;
      throw new Error(`Timed out waiting for the deposit (${last}).`);
    }
    if (!(await wait())) return null;
  }
}
