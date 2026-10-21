import "server-only";
import { call, pactUrl, userAuth } from "../http";

export const CHAIN = "arbitrum-sepolia";
export const YIELD_SOURCE = "sandbox-usdt-arbitrum-sepolia";
export const USDT_TOKEN = "arbitrum-sepolia-test-usdt"; // MockUSDT's token-info slug
export const TERMINAL = ["confirmed", "failed", "expired", "superseded", "invalid"];

type Earned = { total: string; trailing_30d: string };

export type WalletYield = {
  currency: string;
  total_value: string;
  total_earned: Earned;
  positions: {
    source_slug: string;
    symbol: string;
    balance: string;
    value: string;
    earned: Earned; // token units
    earned_value: Earned;
    apy: { total: string | null; trailing_30d: string | null };
  }[];
};

/** Flat: the source's fields plus `currency`. */
export type YieldSource = {
  source_slug: string;
  symbol: string;
  currency: string;
  apy: { base: string; incentives: string; total: string; trailing_30d: string | null };
};

export type BuiltTransaction = {
  id: string;
  status: string;
  user_op_hash: string;
  effects: unknown[];
  expires_at: number; // microseconds
};

export type WebAuthnAssertion = {
  type: "webauthn";
  authenticator_data: string; // base64url
  client_data_json: string; // base64url
  signature: string; // base64url DER
};

export type Transaction = {
  id: string;
  status: string;
  expires_at: number; // microseconds
  transaction_hash: string | null;
  failure_reason: string | null;
};

export async function getWalletYield(token: string, address: string): Promise<WalletYield> {
  // yield-analytics: GET /yield/v0/wallets/{address}
  return call<WalletYield>({
    label: "Get yield position and earnings",
    service: "yield",
    method: "GET",
    url: pactUrl(`/yield/v0/wallets/${encodeURIComponent(address)}?include_positions=true`),
    headers: userAuth(token),
  });
}

export async function getSource(token: string): Promise<YieldSource> {
  // yield-analytics: GET /yield/v0/sources/{source_slug}
  return call<YieldSource>({
    label: "Get yield APY",
    service: "yield",
    method: "GET",
    url: pactUrl(`/yield/v0/sources/${YIELD_SOURCE}`),
    headers: userAuth(token),
  });
}

export async function buildDeposit(
  token: string,
  address: string,
  amount: string,
): Promise<BuiltTransaction> {
  // yield-analytics: POST /yield/v0/wallets/{address}/deposits/build
  return call<BuiltTransaction>({
    label: "Build yield deposit",
    service: "yield",
    method: "POST",
    url: pactUrl(`/yield/v0/wallets/${encodeURIComponent(address)}/deposits/build`),
    headers: userAuth(token),
    json: { source_slug: YIELD_SOURCE, amount },
  });
}

export async function submitSignature(
  token: string,
  id: string,
  assertion: WebAuthnAssertion,
): Promise<Transaction> {
  // yield-analytics: POST /yield/v0/transactions/{id}/submit
  return call<Transaction>({
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
  });
}

export async function getTransaction(token: string, id: string): Promise<Transaction> {
  // yield-analytics: GET /yield/v0/transactions/{id}
  return call<Transaction>({
    label: "Poll transaction status",
    service: "yield",
    method: "GET",
    url: pactUrl(`/yield/v0/transactions/${encodeURIComponent(id)}`),
    headers: userAuth(token),
  });
}
