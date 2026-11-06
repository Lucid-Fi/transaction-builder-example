import "server-only";
import { z } from "zod";
import { call, pactUrl, userAuth } from "../http";

export const CHAIN = "arbitrum-sepolia";
export const USDT_ADDRESS = "0x45D9C8b0D6402CDdEFe4e3965E907d29897B9C7d"; // MockUSDT, 6 decimals
export const TERMINAL = ["confirmed", "failed", "expired", "superseded", "invalid"];

export const BuiltTransaction = z.object({
  id: z.string(),
  status: z.string(),
  user_op_hash: z.string(),
  effects: z.array(z.unknown()),
  expires_at: z.number(), // microseconds
});
export type BuiltTransaction = z.infer<typeof BuiltTransaction>;

export type WebAuthnAssertion = {
  type: "webauthn";
  authenticator_data: string; // base64url
  client_data_json: string; // base64url
  signature: string; // base64url DER
};

export const Transaction = z.object({
  id: z.string(),
  status: z.string(),
  expires_at: z.number(), // microseconds
  transaction_hash: z.string().nullable(),
  failure_reason: z.string().nullable(),
});
export type Transaction = z.infer<typeof Transaction>;

export async function buildSend(
  userToken: string,
  wallet: string,
  recipient: string,
  amount: string,
): Promise<BuiltTransaction> {
  // tx-builder: POST /tx-builder/v0/transactions
  return call({
    label: "Build token transfer",
    service: "tx-builder",
    method: "POST",
    url: pactUrl("/tx-builder/v0/transactions"),
    headers: userAuth(userToken),
    json: { chain: CHAIN, wallet, intent: { type: "send_token", token: USDT_ADDRESS, amount, recipient } },
    schema: BuiltTransaction,
  });
}

export async function submitSignature(
  userToken: string,
  id: string,
  assertion: WebAuthnAssertion,
): Promise<Transaction> {
  // tx-builder: POST /tx-builder/v0/transactions/{id}/signature
  return call({
    label: "Submit passkey signature",
    service: "tx-builder",
    method: "POST",
    url: pactUrl(`/tx-builder/v0/transactions/${encodeURIComponent(id)}/signature`),
    headers: userAuth(userToken),
    json: {
      type: "webauthn",
      authenticator_data: assertion.authenticator_data,
      client_data_json: assertion.client_data_json,
      signature: assertion.signature,
    },
    schema: Transaction,
  });
}

export async function getTransaction(userToken: string, id: string): Promise<Transaction> {
  // tx-builder: GET /tx-builder/v0/transactions/{id}
  return call({
    label: "Poll transaction status",
    service: "tx-builder",
    method: "GET",
    url: pactUrl(`/tx-builder/v0/transactions/${encodeURIComponent(id)}`),
    headers: userAuth(userToken),
    schema: Transaction,
  });
}
