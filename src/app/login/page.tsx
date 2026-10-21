"use client";

import { useActionState, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendOtp, verifyOtp, type LoginState } from "./actions";

export default function LoginPage() {
  // Bumping the key remounts the card, which resets both action states back to step 1.
  const [attempt, setAttempt] = useState(0);
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-12">
      <LoginCard key={attempt} onReset={() => setAttempt((n) => n + 1)} />
    </main>
  );
}

function LoginCard({ onReset }: { onReset: () => void }) {
  const [sent, sendAction, sending] = useActionState(sendOtp, null);
  const [verified, verifyAction, verifying] = useActionState(verifyOtp, null);
  const phone = sent?.sent ? sent.phone : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          {phone ? `Enter the code we texted to ${phone}.` : "Sign in with your phone number."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {phone ? (
          <form action={verifyAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{4,10}"
                required
                autoFocus
              />
            </div>
            <ErrorAlert state={verified} />
            <Button type="submit" className="w-full" disabled={verifying}>
              {verifying ? "Verifying…" : "Verify"}
            </Button>
            <Button type="button" variant="link" className="w-full" onClick={onReset}>
              Use a different number
            </Button>
          </form>
        ) : (
          <form action={sendAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                placeholder="+14155550123"
                defaultValue={sent?.phone}
                aria-describedby="phone-help"
                required
              />
              <p id="phone-help" className="text-xs text-muted-foreground">
                Use E.164, e.g. +14155550123
              </p>
            </div>
            <ErrorAlert state={sent} />
            <Button type="submit" className="w-full" disabled={sending}>
              {sending ? "Continuing…" : "Continue"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function ErrorAlert({ state }: { state: LoginState }) {
  if (!state?.error) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription>{state.error}</AlertDescription>
    </Alert>
  );
}
