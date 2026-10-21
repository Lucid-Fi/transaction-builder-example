import "server-only";
import { z } from "zod";
import { call, pactUrl, userAuth } from "../http";

const LabelledTransaction = z.object({
  id: z.string(),
  tx_hash: z.string().nullable(),
  timestamp: z.number(), // microseconds
  classification: z.string(),
  status: z.string(),
  volume_usd: z.string().nullable(),
  token_legs: z.array(
    z.object({
      direction: z.string(),
      token_symbol: z.string().optional(),
      amount_decimal: z.string().optional(),
      amount_usd: z.string().optional(),
      counterparty_label: z.string().optional(),
    }),
  ),
});
export type LabelledTransaction = z.infer<typeof LabelledTransaction>;

const TransactionPage = z.object({
  data: z.array(LabelledTransaction),
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
});
export type TransactionPage = z.infer<typeof TransactionPage>;

export async function listTransactions(
  token: string,
  address: string,
  filters: Record<string, string> = {},
): Promise<TransactionPage> {
  const query = new URLSearchParams({ wallet_addresses: address, count: "20", ...filters });
  // classifier-api: GET /transactions/v0/transactions (labelled activity feed)
  return call({
    label: "List labelled transactions",
    service: "transactions",
    method: "GET",
    url: pactUrl(`/transactions/v0/transactions?${query}`),
    headers: userAuth(token),
    schema: TransactionPage,
  });
}
