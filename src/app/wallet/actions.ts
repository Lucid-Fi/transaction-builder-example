"use server";

import { revalidatePath } from "next/cache";
import { isAmount } from "@/lib/amount";
import { requireSession } from "@/lib/auth";
import { faucetAddress, mintTestUsdt } from "@/lib/faucet";
import { ApiError } from "@/lib/http";
import * as txBuilder from "@/lib/pact/tx-builder";
import type { Transaction, WebAuthnAssertion } from "@/lib/pact/tx-builder";
import * as yieldApi from "@/lib/pact/yield";

type Result<T> = T | { error: string; status?: number };
// `terminal` saves the client importing TERMINAL from a server-only module.
export type TransactionStatus = Transaction & { terminal: boolean };

const B64URL = /^[A-Za-z0-9_-]+$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const isB64url = (v: unknown) => typeof v === "string" && B64URL.test(v);
const isAssertion = (a: WebAuthnAssertion) =>
  a?.type === "webauthn" && isB64url(a.authenticator_data) && isB64url(a.client_data_json) && isB64url(a.signature);

const withStatus = (tx: Transaction): TransactionStatus => ({ ...tx, terminal: txBuilder.TERMINAL.includes(tx.status) });

export async function buildDeposit(
  amount: string,
): Promise<Result<{ id: string; user_op_hash: string; effects: unknown[]; expires_at: number }>> {
  // Server Action arguments come straight from the browser, so check them.
  if (!isAmount(amount)) return { error: "Enter an amount greater than 0 with at most 6 decimals." };
  const session = await requireSession();
  const address = session.walletAddress;
  if (!address) return { error: "No wallet in this session." };
  try {
    const { id, user_op_hash, effects, expires_at } = await yieldApi.buildDeposit(session.userToken, address, amount);
    return { id, user_op_hash, effects, expires_at };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    throw err;
  }
}

export async function submitDeposit(id: string, assertion: WebAuthnAssertion): Promise<Result<TransactionStatus>> {
  if (!isB64url(id)) return { error: "Invalid transaction id." };
  if (!isAssertion(assertion)) return { error: "Invalid passkey signature." };
  const session = await requireSession();
  try {
    return withStatus(await yieldApi.submitSignature(session.userToken, id, assertion));
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message, status: err.status };
    throw err;
  }
}

export async function getDeposit(id: string): Promise<Result<TransactionStatus>> {
  if (!isB64url(id)) return { error: "Invalid transaction id." };
  const session = await requireSession();
  try {
    return withStatus(await yieldApi.getTransaction(session.userToken, id));
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message, status: err.status };
    throw err;
  }
}

export async function buildSend(
  recipient: string,
  amount: string,
): Promise<Result<{ id: string; user_op_hash: string; effects: unknown[]; expires_at: number }>> {
  if (typeof recipient !== "string" || !ADDRESS.test(recipient)) return { error: "Enter a 0x address with 40 hex characters." };
  if (!isAmount(amount)) return { error: "Enter an amount greater than 0 with at most 6 decimals." };
  const session = await requireSession();
  const address = session.walletAddress;
  if (!address) return { error: "No wallet in this session." };
  try {
    const { id, user_op_hash, effects, expires_at } = await txBuilder.buildSend(session.userToken, address, recipient, amount);
    return { id, user_op_hash, effects, expires_at };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    throw err;
  }
}

export async function submitSend(id: string, assertion: WebAuthnAssertion): Promise<Result<TransactionStatus>> {
  if (!isB64url(id)) return { error: "Invalid transaction id." };
  if (!isAssertion(assertion)) return { error: "Invalid passkey signature." };
  const session = await requireSession();
  try {
    return withStatus(await txBuilder.submitSignature(session.userToken, id, assertion));
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message, status: err.status };
    throw err;
  }
}

export async function getSend(id: string): Promise<Result<TransactionStatus>> {
  if (!isB64url(id)) return { error: "Invalid transaction id." };
  const session = await requireSession();
  try {
    return withStatus(await txBuilder.getTransaction(session.userToken, id));
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
