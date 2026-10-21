"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { faucetAddress, mintTestUsdt } from "@/lib/faucet";
import { ApiError } from "@/lib/http";
import {
  buildDeposit as buildYieldDeposit,
  getTransaction,
  submitSignature,
  TERMINAL,
  type Transaction,
  type WebAuthnAssertion,
} from "@/lib/pact/yield";

type Result<T> = T | { error: string; status?: number };
// `terminal` saves the client importing TERMINAL from a server-only module.
export type DepositStatus = Transaction & { terminal: boolean };

const AMOUNT = /^\d+(\.\d{1,6})?$/;
const B64URL = /^[A-Za-z0-9_-]+$/;
const isB64url = (v: unknown) => typeof v === "string" && B64URL.test(v);

const withStatus = (tx: Transaction): DepositStatus => ({ ...tx, terminal: TERMINAL.includes(tx.status) });

export async function buildDeposit(
  amount: string,
): Promise<Result<{ id: string; user_op_hash: string; effects: unknown[]; expires_at: number }>> {
  // Server Action arguments come straight from the browser, so check them.
  if (typeof amount !== "string" || !AMOUNT.test(amount) || !/[1-9]/.test(amount)) {
    return { error: "Enter an amount greater than 0 with at most 6 decimals." };
  }
  const session = await requireSession();
  const address = session.walletAddress;
  if (!address) return { error: "No wallet in this session." };
  try {
    const { id, user_op_hash, effects, expires_at } = await buildYieldDeposit(session.userToken, address, amount);
    return { id, user_op_hash, effects, expires_at };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    throw err;
  }
}

export async function submitDeposit(id: string, assertion: WebAuthnAssertion): Promise<Result<DepositStatus>> {
  if (!isB64url(id)) return { error: "Invalid transaction id." };
  if (
    assertion?.type !== "webauthn" ||
    !isB64url(assertion.authenticator_data) ||
    !isB64url(assertion.client_data_json) ||
    !isB64url(assertion.signature)
  ) {
    return { error: "Invalid passkey signature." };
  }
  const session = await requireSession();
  try {
    return withStatus(await submitSignature(session.userToken, id, assertion));
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message, status: err.status };
    throw err;
  }
}

export async function getDeposit(id: string): Promise<Result<DepositStatus>> {
  if (!isB64url(id)) return { error: "Invalid transaction id." };
  const session = await requireSession();
  try {
    return withStatus(await getTransaction(session.userToken, id));
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message, status: err.status };
    throw err;
  }
}

// DEMO ONLY: the demo faucet (src/lib/faucet.ts), not part of the integration. Takes no arguments: it
// always mints to the session's wallet.
export async function fundFromFaucet(): Promise<Result<{ txHash: string; confirmed: boolean }>> {
  const session = await requireSession();
  const address = session.walletAddress;
  if (!address || session.ephemeral) return { error: "No wallet in this session." };
  if (!faucetAddress()) return { error: "The demo faucet is off." };
  try {
    const minted = await mintTestUsdt(address);
    revalidatePath("/wallet");
    return minted;
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
