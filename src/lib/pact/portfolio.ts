import "server-only";
import { z } from "zod";
import { call, pactUrl, userAuth } from "../http";
import { CHAIN } from "./yield";

const Holding = z.object({
  token_address: z.string(),
  token_slug: z.string(),
  symbol: z.string(),
  decimals: z.number(),
  balance: z.string(),
  value: z.string(),
});
export type Holding = z.infer<typeof Holding>;

const ChainPortfolio = z.object({
  currency: z.string(),
  total_value: z.string(),
  groups: z.array(z.object({ holdings: z.array(Holding).optional() })), // holdings omitted when empty
});
export type ChainPortfolio = z.infer<typeof ChainPortfolio>;

export async function getChainPortfolio(token: string, address: string): Promise<ChainPortfolio> {
  // portfolio: GET /portfolio/v0/chains/{chain}/wallets/{address}/portfolio
  return call({
    label: "Get wallet balances",
    service: "portfolio",
    method: "GET",
    url: pactUrl(
      `/portfolio/v0/chains/${CHAIN}/wallets/${encodeURIComponent(address)}/portfolio?include_holdings=true&group_by=token_slug`,
    ),
    headers: userAuth(token),
    schema: ChainPortfolio,
  });
}
