"use client";

import { unstable_rethrow, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AMOUNT_PATTERN } from "@/lib/amount";
import { signUserOpHash } from "@/lib/webauthn";
import { buildSend, getSend, submitSend } from "./actions";
import { settle } from "./settle";

const POLL_MS = 2000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function SendForm({ credentialId, rpId }: { credentialId: string; rpId: string }) {
  const router = useRouter();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, startTransition] = useTransition();
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  // Stops the poll loop when the form unmounts.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function send() {
    setStep("Building transaction…");
    const built = await buildSend(recipient.trim(), amount.trim());
    if ("error" in built) throw new Error(built.error);

    setStep("Confirm with passkey…");
    const assertion = await signUserOpHash({ hash: built.user_op_hash, credentialId, rpId });

    setStep("Submitting…");
    const tx = await settle(
      () => submitSend(built.id, assertion),
      () => getSend(built.id),
      {
        // Stop 90s after the built transaction expires (expires_at is in µs).
        deadline: built.expires_at / 1000 + 90_000,
        wait: async () => {
          await sleep(POLL_MS);
          return mounted.current;
        },
        onStep: setStep,
      },
    );
    if (!tx) return;
    if (tx.status !== "confirmed") {
      throw new Error(`Send ${tx.status}${tx.failure_reason ? ` (${tx.failure_reason})` : ""}.`);
    }
    setTxHash(tx.transaction_hash);
    setRecipient("");
    setAmount("");
    router.refresh();
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setTxHash(null);
    // In a transition, a rethrown redirect (e.g. the session expired mid-send) navigates instead of showing as an error.
    startTransition(async () => {
      try {
        await send();
      } catch (err) {
        unstable_rethrow(err);
        if (mounted.current) setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="recipient">Recipient</Label>
        <Input
          id="recipient"
          className="font-mono"
          placeholder="0x…"
          autoComplete="off"
          spellCheck={false}
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          disabled={busy}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="send-amount">Amount (USDT)</Label>
        <div className="flex gap-2">
          <Input
            id="send-amount"
            inputMode="decimal"
            pattern={AMOUNT_PATTERN}
            title="A number like 10 or 0.5, with at most 6 decimals"
            placeholder="10.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy}
            required
          />
          <Button type="submit" disabled={busy || !recipient.trim() || !amount.trim()}>
            Send
          </Button>
        </div>
      </div>
      {step && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {step}
        </p>
      )}
      {txHash && (
        <p className="text-sm">
          Confirmed: <span className="font-mono break-all">{txHash}</span>
        </p>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
