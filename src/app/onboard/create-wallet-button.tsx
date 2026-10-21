"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { createPasskey } from "@/lib/webauthn";
import { createWallet, finishSetup } from "./actions";

/** `finish`: the wallet exists but setup didn't complete, so retry it without a new passkey. */
export function CreateWalletButton({ rpId, phone, finish }: { rpId: string; phone: string; finish?: boolean }) {
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onClick() {
    setError(null);
    startTransition(async () => {
      if (finish) {
        setStep("Finishing setup…");
        const result = await finishSetup();
        if (result?.error) setError(result.error);
        return;
      }
      setStep("Creating passkey…");
      let key;
      try {
        key = await createPasskey({ rpId, userName: phone });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return;
      }
      setStep("Creating wallet…");
      // Outside the try: on success the action's redirect() to /wallet arrives as a thrown error.
      const result = await createWallet(key);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button className="w-full" onClick={onClick} disabled={pending}>
        {pending ? (step ?? "Working…") : finish ? "Finish setup" : "Create passkey wallet"}
      </Button>
    </div>
  );
}
