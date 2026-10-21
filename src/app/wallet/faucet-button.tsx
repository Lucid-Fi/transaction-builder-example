"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { fundFromFaucet } from "./actions";
import { short } from "./format";

/** DEMO ONLY: mints test USDT to the session's wallet (src/lib/faucet.ts). */
export function FaucetButton() {
  const [result, setResult] = useState<{ txHash: string; confirmed: boolean } | { error: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function onClick() {
    setResult(null);
    // No catch: a redirect from requireSession arrives as a thrown error and navigates.
    startTransition(async () => setResult(await fundFromFaucet()));
  }

  return (
    <div className="space-y-2">
      <Button variant="outline" onClick={onClick} disabled={pending}>
        {pending ? "Minting…" : "Mint 100 test USDT"}
      </Button>
      {result && "txHash" in result && (
        <>
          <p className="text-sm">
            {result.confirmed ? "Minted" : "Sent"} 100 test USDT:{" "}
            <a
              href={`https://sepolia.arbiscan.io/tx/${result.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono underline"
            >
              {short(result.txHash)}
            </a>
          </p>
          <p className="text-sm text-muted-foreground">
            {result.confirmed
              ? "Your balance updates in a few seconds. Refresh if it hasn't moved yet."
              : "Not confirmed yet; it may still land. Check the link before minting again."}
          </p>
        </>
      )}
      {result && "error" in result && (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
