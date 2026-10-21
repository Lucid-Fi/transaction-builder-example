"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { config } from "@/lib/config";
import { ApiError } from "@/lib/http";
import { createPasskeyAccount } from "@/lib/pact/aa";
import { isEphemeral, mintToken, tokenExpiry } from "@/lib/pact/charon";
import { activate } from "@/lib/pact/wims";
import { setSession, type Session } from "@/lib/session";

export type PasskeyKey = { x: number[]; y: number[]; credentialId: string };

const isByte32 = (v: unknown) =>
  Array.isArray(v) && v.length === 32 && v.every((b) => Number.isInteger(b) && b >= 0 && b <= 255);

// Link the phone to the wallet, then swap the ephemeral token for a standard one.
async function upgradeEphemeral(session: Session, walletAddress: string): Promise<void> {
  await activate(session.userToken, walletAddress);
  const minted = await mintToken(session.phone, session.entityId);
  await setSession({
    ...session,
    userToken: minted.access_token,
    tokenExp: tokenExpiry(minted.access_token),
    entityId: minted.entity_id,
    ephemeral: isEphemeral(minted.access_token),
  });
}

export async function createWallet(key: PasskeyKey): Promise<{ error: string }> {
  // Server Action arguments come straight from the browser, so check them.
  if (
    !isByte32(key?.x) ||
    !isByte32(key?.y) ||
    typeof key?.credentialId !== "string" ||
    !/^[A-Za-z0-9_-]+$/.test(key.credentialId)
  ) {
    return { error: "Invalid passkey public key." };
  }
  const session = await requireSession();
  // A wallet already exists (e.g. a retry after a failed upgrade): finish it instead of creating another.
  if (session.walletAddress) return finishSetup();
  const rpId = config.webauthnRpId;

  try {
    const account = await createPasskeyAccount(session.userToken, {
      entityId: session.entityId,
      x: key.x,
      y: key.y,
      credentialId: key.credentialId,
      rpId,
    });
    // Save the wallet first: if the upgrade below fails, a retry must not create a second account.
    const next = { ...session, walletAddress: account.address, credentialId: key.credentialId, rpId };
    await setSession(next);
    if (next.ephemeral) await upgradeEphemeral(next, account.address);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    throw err;
  }
  // redirect() throws, so it stays outside the try.
  redirect("/wallet");
}

/** Retries the ephemeral upgrade for a wallet that already exists (no new passkey). */
export async function finishSetup(): Promise<{ error: string }> {
  const session = await requireSession();
  if (!session.walletAddress) return { error: "No wallet to finish setting up." };
  try {
    if (session.ephemeral) await upgradeEphemeral(session, session.walletAddress);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    throw err;
  }
  redirect("/wallet");
}
