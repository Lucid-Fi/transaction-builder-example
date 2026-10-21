import { afterEach, expect, it, vi } from "vitest";
import { faucetAddress, mintTestUsdt } from "./faucet";
import { listCalls } from "./recorder";

// Hardhat account 0: a well-known public test key, never funded on a real network.
const KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const RECIPIENT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // Hardhat account 1

// Only mintTestUsdt reads headers (via currentRequest); faucetAddress doesn't.
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-request-id": "req-1", "x-inspector-id": "browser-a" }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  globalThis.__pactCalls?.splice(0); // the inspector ring is global: keep tests order-independent
});

it("faucetAddress is off without a key and derives the key's address", () => {
  vi.stubEnv("DEMO_FAUCET_PRIVATE_KEY", "");
  expect(faucetAddress()).toBeUndefined();
  vi.stubEnv("DEMO_FAUCET_PRIVATE_KEY", KEY);
  expect(faucetAddress()).toBe(ADDRESS);
});

it("mintTestUsdt maps insufficient funds and records the mint as origin-only, key-free calls for the browser", async () => {
  vi.stubEnv("DEMO_FAUCET_PRIVATE_KEY", KEY);
  vi.stubEnv("DEMO_FAUCET_RPC_URL", "https://rpc.test/v2/secret-path");
  const error = { code: -32000, message: "insufficient funds for gas * price + value" };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error }), { headers: { "content-type": "application/json" } })),
  );

  await expect(mintTestUsdt(RECIPIENT)).rejects.toThrow("needs Arbitrum Sepolia ETH");
  const calls = listCalls("browser-a"); // visible to the browser that clicked
  expect(calls.length).toBeGreaterThan(0);
  for (const call of calls) {
    expect(call).toMatchObject({ service: "EVM RPC (demo faucet, not a Pact API)", url: "https://rpc.test" });
  }
  const recorded = JSON.stringify(calls);
  // mint(RECIPIENT, 100 USDT) on MockUSDT, whichever RPC method carries it.
  expect(recorded.toLowerCase()).toContain("0x45d9c8b0d6402cddefe4e3965e907d29897b9c7d");
  expect(recorded).toContain(
    "0x40c10f19" + RECIPIENT.slice(2).toLowerCase().padStart(64, "0") + (100_000_000).toString(16).padStart(64, "0"),
  );
  expect(recorded).not.toContain(KEY.slice(2));
  expect(recorded).not.toContain("secret-path");
});

const HASH = "0x" + "ab".repeat(32);

// Scripted JSON-RPC: answers what viem asks for up to eth_sendRawTransaction, then `receipt` for the receipt.
function rpc(receipt: (reply: (result: unknown) => Response) => Response) {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const { id, method } = JSON.parse(String(init.body));
    const reply = (result: unknown) => Response.json({ jsonrpc: "2.0", id, result });
    const results: Record<string, unknown> = {
      eth_chainId: "0x66eee", // Arbitrum Sepolia
      eth_getTransactionCount: "0x1",
      eth_estimateGas: "0x5208",
      eth_maxPriorityFeePerGas: "0x0",
      eth_getBlockByNumber: { number: "0x10", baseFeePerGas: "0x5f5e100", hash: HASH, timestamp: "0x1", transactions: [] },
      eth_blockNumber: "0x10",
      eth_sendRawTransaction: HASH,
      // Read while polling (to spot a replacement); null would be retried with backoff.
      eth_getTransactionByHash: {
        hash: HASH,
        blockNumber: "0x10",
        blockHash: HASH,
        transactionIndex: "0x0",
        from: ADDRESS,
        to: RECIPIENT,
        nonce: "0x1",
        value: "0x0",
        input: "0x",
        gas: "0x5208",
        gasPrice: "0x1",
        type: "0x0",
        v: "0x1b",
        r: "0x1",
        s: "0x1",
      },
    };
    return method === "eth_getTransactionReceipt" ? receipt(reply) : reply(results[method] ?? null);
  });
}

it("mintTestUsdt reports a sent mint as unconfirmed when the receipt poll errors", async () => {
  vi.stubEnv("DEMO_FAUCET_PRIVATE_KEY", KEY);
  // A JSON-RPC error viem doesn't retry, so this fails fast instead of riding out the 30 s timeout.
  const error = { code: -32000, message: "upstream error" };
  vi.stubGlobal("fetch", rpc(() => Response.json({ jsonrpc: "2.0", id: 1, error })));
  await expect(mintTestUsdt(RECIPIENT)).resolves.toEqual({ txHash: HASH, confirmed: false });
});

it("mintTestUsdt throws with the tx hash when the mint reverts", async () => {
  vi.stubEnv("DEMO_FAUCET_PRIVATE_KEY", KEY);
  const receipt = {
    transactionHash: HASH,
    status: "0x0",
    blockNumber: "0x10",
    blockHash: HASH,
    logs: [],
    logsBloom: "0x" + "00".repeat(256),
  };
  vi.stubGlobal("fetch", rpc((reply) => reply(receipt)));
  await expect(mintTestUsdt(RECIPIENT)).rejects.toThrow(`Mint reverted (tx ${HASH}).`);
});

it("mintTestUsdt reports a confirmed mint", async () => {
  vi.stubEnv("DEMO_FAUCET_PRIVATE_KEY", KEY);
  const receipt = {
    transactionHash: HASH,
    status: "0x1",
    blockNumber: "0x10",
    blockHash: HASH,
    logs: [],
    logsBloom: "0x" + "00".repeat(256),
  };
  vi.stubGlobal("fetch", rpc((reply) => reply(receipt)));
  await expect(mintTestUsdt(RECIPIENT)).resolves.toEqual({ txHash: HASH, confirmed: true });
});

it("mintTestUsdt maps a malformed recipient address", async () => {
  vi.stubEnv("DEMO_FAUCET_PRIVATE_KEY", KEY); // getAddress throws before any RPC call
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("no network"); }));
  await expect(mintTestUsdt("0xnot-an-address")).rejects.toThrow(/^Faucet mint failed: Address/);
});
