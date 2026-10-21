import "server-only";
import { z } from "zod";
import { call, pactUrl, userAuth } from "../http";

export const CHAIN = "arbitrum-sepolia";
export const YIELD_SOURCE = "sandbox-usdt-arbitrum-sepolia";
export const USDT_TOKEN = "arbitrum-sepolia-test-usdt"; // MockUSDT's token-info slug
export const TERMINAL = ["confirmed", "failed", "expired", "superseded", "invalid"];

const Earned = z.object({ total: z.string(), trailing_30d: z.string() });

const YieldPosition = z.object({
  source_slug: z.string(),
  symbol: z.string(),
  balance: z.string(),
  value: z.string(),
  earned: Earned, // token units
  earned_value: Earned,
  apy: z.object({ total: z.string().nullable(), trailing_30d: z.string().nullable() }),
});

const WalletYield = z.object({
  currency: z.string(),
  total_value: z.string(),
  total_earned: Earned,
  positions: z.array(YieldPosition).optional(),
});
export type WalletYield = z.infer<typeof WalletYield>;

/** Flat: the source's fields plus `currency`. */
const YieldSource = z.object({
  source_slug: z.string(),
  symbol: z.string(),
  currency: z.string(),
  apy: z.object({ base: z.string(), incentives: z.string(), total: z.string(), trailing_30d: z.string().nullable() }),
});
export type YieldSource = z.infer<typeof YieldSource>;

const BuiltTransaction = z.object({
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

const Transaction = z.object({
  id: z.string(),
  status: z.string(),
  expires_at: z.number(), // microseconds
  transaction_hash: z.string().nullable(),
  failure_reason: z.string().nullable(),
});
export type Transaction = z.infer<typeof Transaction>;

export async function getWalletYield(token: string, address: string): Promise<WalletYield> {
  // yield-analytics: GET /yield/v0/wallets/{address}
  return call({
    label: "Get yield position and earnings",
    service: "yield",
    method: "GET",
    url: pactUrl(`/yield/v0/wallets/${encodeURIComponent(address)}?include_positions=true`),
    headers: userAuth(token),
    schema: WalletYield,
  });
}

export async function getSource(token: string): Promise<YieldSource> {
  // yield-analytics: GET /yield/v0/sources/{source_slug}
  return call({
    label: "Get yield APY",
    service: "yield",
    method: "GET",
    url: pactUrl(`/yield/v0/sources/${YIELD_SOURCE}`),
    headers: userAuth(token),
    schema: YieldSource,
  });
}

export async function buildDeposit(
  token: string,
  address: string,
  amount: string,
): Promise<BuiltTransaction> {
  // yield-analytics: POST /yield/v0/wallets/{address}/deposits/build
  return call({
    label: "Build yield deposit",
    service: "yield",
    method: "POST",
    url: pactUrl(`/yield/v0/wallets/${encodeURIComponent(address)}/deposits/build`),
    headers: userAuth(token),
    json: { source_slug: YIELD_SOURCE, amount },
    schema: BuiltTransaction,
  });
}

export async function submitSignature(
  token: string,
  id: string,
  assertion: WebAuthnAssertion,
): Promise<Transaction> {
  // yield-analytics: POST /yield/v0/transactions/{id}/submit
  return call({
    label: "Submit passkey signature",
    service: "yield",
    method: "POST",
    url: pactUrl(`/yield/v0/transactions/${encodeURIComponent(id)}/submit`),
    headers: userAuth(token),
    json: {
      type: "webauthn",
      authenticator_data: assertion.authenticator_data,
      client_data_json: assertion.client_data_json,
      signature: assertion.signature,
    },
    schema: Transaction,
  });
}

export async function getTransaction(token: string, id: string): Promise<Transaction> {
  // yield-analytics: GET /yield/v0/transactions/{id}
  return call({
    label: "Poll transaction status",
    service: "yield",
    method: "GET",
    url: pactUrl(`/yield/v0/transactions/${encodeURIComponent(id)}`),
    headers: userAuth(token),
    schema: Transaction,
  });
}
