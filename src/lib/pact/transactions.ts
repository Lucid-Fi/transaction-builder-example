import "server-only";
import { call, pactUrl, userAuth } from "../http";

export type LabelledTransaction = {
  id: string;
  tx_hash: string | null;
  timestamp: number; // microseconds
  classification: string;
  status: string;
  volume_usd: string | null;
  token_legs: {
    direction: string;
    token_symbol?: string;
    amount_decimal?: string;
    amount_usd?: string;
    counterparty_label?: string;
  }[];
};

export type TransactionPage = {
  data: LabelledTransaction[];
  next_cursor: string | null;
  has_more: boolean;
};

export async function listTransactions(
  token: string,
  address: string,
  filters: Record<string, string> = {},
): Promise<TransactionPage> {
  const query = new URLSearchParams({ wallet_addresses: address, count: "20", ...filters });
  // classifier-api: GET /transactions/v0/transactions (labelled activity feed)
  return call<TransactionPage>({
    label: "List labelled transactions",
    service: "transactions",
    method: "GET",
    url: pactUrl(`/transactions/v0/transactions?${query}`),
    headers: userAuth(token),
  });
}
