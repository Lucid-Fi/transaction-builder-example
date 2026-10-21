import "server-only";
import { call, pactUrl, userAuth } from "../http";
import { CHAIN } from "./yield";

export type Holding = {
  token_address: string;
  token_slug: string;
  symbol: string;
  decimals: number;
  balance: string;
  value: string;
};

export type ChainPortfolio = {
  currency: string;
  total_value: string;
  groups: { holdings?: Holding[] }[]; // holdings omitted when empty
};

export async function getChainPortfolio(token: string, address: string): Promise<ChainPortfolio> {
  // portfolio: GET /portfolio/v0/chains/{chain}/wallets/{address}/portfolio
  return call<ChainPortfolio>({
    label: "Get wallet balances",
    service: "portfolio",
    method: "GET",
    url: pactUrl(
      `/portfolio/v0/chains/${CHAIN}/wallets/${encodeURIComponent(address)}/portfolio?include_holdings=true&group_by=token_slug`,
    ),
    headers: userAuth(token),
  });
}
