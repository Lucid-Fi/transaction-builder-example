"use server";

import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { ApiError } from "@/lib/http";
import { lookupAccount } from "@/lib/pact/aa";
import { isEphemeral, mintToken, tokenExpiry } from "@/lib/pact/charon";
import { clearSession, getOtpPhone, setOtpPhone, setSession } from "@/lib/session";
import { checkVerification, startVerification } from "@/lib/twilio";

export type LoginState = { error?: string; phone?: string; sent?: boolean } | null;

const E164 = /^\+[1-9]\d{7,14}$/;
const CODE = /^\d{4,10}$/;

export async function sendOtp(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const phone = String(formData.get("phone") ?? "").trim();
  if (!E164.test(phone)) return { phone, error: "Enter the number in E.164 format, e.g. +14155550123." };
  // Demo: without Twilio, any valid number signs in without a code.
  if (!config.twilioEnabled) return { phone, error: await signIn(phone) };
  try {
    await startVerification(phone);
  } catch (err) {
    if (err instanceof ApiError) return { phone, error: err.message };
    throw err;
  }
  await setOtpPhone(phone);
  return { phone, sent: true };
}

export async function verifyOtp(_prev: LoginState, formData: FormData): Promise<LoginState> {
  // The phone comes from the signed otp_phone cookie, never the form.
  const phone = await getOtpPhone();
  if (!phone) return { error: "Your code expired. Use a different number to request a new one." };
  const code = String(formData.get("code") ?? "").trim();
  if (!CODE.test(code)) return { phone, sent: true, error: "Enter the digits from the SMS." };

  let matched: boolean;
  try {
    matched = await checkVerification(phone, code);
  } catch (err) {
    if (err instanceof ApiError) return { phone, sent: true, error: err.message };
    throw err;
  }
  if (!matched) return { phone, sent: true, error: "That code didn't match. Check the SMS and try again." };
  return { phone, sent: true, error: await signIn(phone) };
}

// Not exported: every export of a "use server" file is a public Server Action.
async function signIn(phone: string): Promise<string | undefined> {
  let needsWallet: boolean;
  try {
    const minted = await mintToken(phone);
    const ephemeral = isEphemeral(minted.access_token);
    // An ephemeral entity has no wallet yet, so skip the lookup.
    const account = ephemeral ? null : await lookupAccount(minted.access_token, minted.entity_id);
    await setSession({
      phone,
      entityId: minted.entity_id,
      userToken: minted.access_token,
      tokenExp: tokenExpiry(minted.access_token),
      ephemeral,
      walletAddress: account?.address,
      credentialId: account?.sudo_key.credential_id,
      rpId: account?.sudo_key.rp_id,
    });
    needsWallet = !account;
  } catch (err) {
    if (err instanceof ApiError) return err.message;
    throw err;
  }
  // redirect() throws, so it stays outside the try.
  redirect(needsWallet ? "/onboard" : "/wallet");
}

export async function signOut(): Promise<void> {
  await clearSession();
  redirect("/login");
}
