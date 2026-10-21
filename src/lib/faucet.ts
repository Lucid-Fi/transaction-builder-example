// DEMO ONLY, not part of a Payactiv integration (real users are funded by payroll). The one place this
// app talks to an EVM RPC directly: a server key mints MockUSDT so a new wallet can try a deposit.
// Off unless DEMO_FAUCET_PRIVATE_KEY is set. To remove it, see "Demo faucet" in README.md.
import "server-only";
import {
  BaseError,
  createWalletClient,
  getAddress,
  http,
  InsufficientFundsError,
  parseAbi,
  publicActions,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import { currentRequest } from "./http";
import { record, redact } from "./recorder";

const MOCK_USDT = "0x45D9C8b0D6402CDdEFe4e3965E907d29897B9C7d"; // Arbitrum Sepolia, 6 decimals
const ABI = parseAbi(["function mint(address to, uint256 amount)"]);
const AMOUNT = BigInt(100_000_000); // 100 USDT (tsconfig targets ES2017: no bigint literals)

const account = () => {
  const key = process.env.DEMO_FAUCET_PRIVATE_KEY;
  return key ? privateKeyToAccount(key as Hex) : undefined;
};

/** The address that pays gas; undefined when the faucet is off. */
export const faucetAddress = (): string | undefined => account()?.address;

function parse(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

// viem's fetchFn: records each JSON-RPC call for the inspector. The private key never leaves the process
// (the account is local and signs locally); the signed raw transaction in eth_sendRawTransaction is shown
// on purpose because it's public on-chain.
async function recordedFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const started = performance.now();
  const body = parse(String(init?.body)) as { method?: string } | null;
  let status = 0;
  let responseBody: unknown;
  try {
    const res = await fetch(input, init);
    status = res.status;
    responseBody = parse(await res.clone().text()); // viem reads the original
    return res;
  } catch (err) {
    responseBody = { error: String(err) };
    throw err;
  } finally {
    const request = redact(Object.fromEntries(new Headers(init?.headers)), body);
    record({
      ...(await currentRequest()),
      at: new Date().toISOString(),
      label: `Demo faucet: ${body?.method}`,
      service: "EVM RPC (demo faucet, not a Pact API)",
      method: "POST",
      // Origin only: hosted RPC URLs often carry an API key in the path (origin also drops user:pass@).
      url: new URL(input instanceof Request ? input.url : String(input)).origin,
      requestHeaders: request.headers,
      requestBody: request.body,
      status,
      responseBody: redact({}, responseBody).body,
      ms: Math.round(performance.now() - started),
    });
  }
}

export async function mintTestUsdt(to: string): Promise<{ txHash: string; confirmed: boolean }> {
  const acct = account();
  if (!acct) throw new Error("The demo faucet is off.");
  const client = createWalletClient({
    account: acct,
    chain: arbitrumSepolia,
    transport: http(process.env.DEMO_FAUCET_RPC_URL || undefined, { fetchFn: recordedFetch }),
  }).extend(publicActions);
  // Inside .then so a bad address (getAddress throws) goes through the same mapping.
  const hash = await Promise.resolve()
    .then(() => client.writeContract({ address: MOCK_USDT, abi: ABI, functionName: "mint", args: [getAddress(to), AMOUNT] }))
    .catch((err) => {
      if (!(err instanceof BaseError)) throw err;
      if (err.walk((e) => e instanceof InsufficientFundsError)) {
        throw new Error(`The faucet address ${acct.address} needs Arbitrum Sepolia ETH for gas.`, { cause: err });
      }
      throw new Error(`Faucet mint failed: ${err.shortMessage}`, { cause: err });
    });
  // Bounded: each poll lands in the 200-call inspector ring, and the default (500 ms for 180 s) outlasts serverless limits.
  // Once sent, a receipt error (timeout, RPC 429/5xx) doesn't mean the mint failed: report it unconfirmed.
  const receipt = await client
    .waitForTransactionReceipt({ hash, pollingInterval: 2_000, timeout: 30_000 })
    .catch(() => undefined);
  if (receipt?.status === "reverted") throw new Error(`Mint reverted (tx ${hash}).`);
  return { txHash: hash, confirmed: Boolean(receipt) };
}
