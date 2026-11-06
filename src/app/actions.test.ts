import { beforeEach, describe, expect, it, vi } from "vitest";
import { sign } from "@/lib/session";
import { sendOtp, verifyOtp } from "./login/actions";
import { createWallet } from "./onboard/actions";
import { buildDeposit, buildSend, fundFromFaucet, getDeposit, getSend, submitDeposit, submitSend } from "./wallet/actions";

// With no cookie jar, cookies() throws: an input that gets past validation reaches requireSession and rejects.
const jar = vi.hoisted(() => ({ values: null as Map<string, string> | null }));
vi.mock("next/headers", () => ({
  cookies: async () => {
    if (!jar.values) throw new Error("no request");
    const values = jar.values;
    return { get: (name: string) => (values.has(name) ? { value: values.get(name) } : undefined), set: () => {} };
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
const faucet = vi.hoisted(() => ({ address: "0xfaucet" as string | undefined, mint: vi.fn() }));
vi.mock("@/lib/faucet", () => ({ faucetAddress: () => faucet.address, mintTestUsdt: faucet.mint }));
// The real revalidatePath needs a Next request store.
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => cache);

const SECRET = "test-secret-at-least-32-bytes-long!!";
const byte32 = Array(32).fill(1);

beforeEach(() => {
  jar.values = null;
  vi.stubEnv("SESSION_SECRET", SECRET);
});

describe("Server Action input checks", () => {
  it.each(["0", "0.000000", "abc", "1.1234567", "-1", " 1", "1e3", "1.", "01", "00.5"])(
    "buildDeposit rejects %j",
    async (amount) => {
      await expect(buildDeposit(amount)).resolves.toHaveProperty("error");
    },
  );

  it("buildDeposit lets a valid amount through to the session check", async () => {
    await expect(buildDeposit("1.5")).rejects.toThrow("no request");
  });

  const TO = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

  it.each(["", "0x123", "70997970C51812dc3A010C7d01b50e0d17dc79C8", `${TO}0`, "0x70997970C51812dc3A010C7d01b50e0d17dc79CZ"])(
    "buildSend rejects recipient %j",
    async (recipient) => {
      await expect(buildSend(recipient, "1")).resolves.toHaveProperty("error");
    },
  );

  it.each(["0", "abc", "1.1234567", "01", "00.5"])("buildSend rejects amount %j", async (amount) => {
    await expect(buildSend(TO, amount)).resolves.toHaveProperty("error");
  });

  it("buildSend lets a valid recipient and amount through to the session check", async () => {
    await expect(buildSend(TO, "1.5")).rejects.toThrow("no request");
  });

  it("createWallet rejects a missing credentialId, a null key and a 31-byte x", async () => {
    const bad = [
      { x: byte32, y: byte32 },
      null,
      { x: byte32.slice(1), y: byte32, credentialId: "cred" },
    ];
    for (const key of bad) {
      await expect(createWallet(key as never)).resolves.toHaveProperty("error");
    }
    await expect(createWallet({ x: byte32, y: byte32, credentialId: "cred" })).rejects.toThrow("no request");
  });
});

it("verifyOtp: an ephemeral mint skips the wallet lookup and goes to /onboard", async () => {
  vi.stubEnv("PACT_SECRET_KEY", "pactlabs_sk_sentinel");
  vi.stubEnv("TWILIO_VERIFY_SERVICE_SID", "VA1");
  vi.stubEnv("TWILIO_API_KEY_SID", "SK1");
  vi.stubEnv("TWILIO_API_KEY_SECRET", "secret");
  const phone = "+15551234567";
  jar.values = new Map([["otp_phone", sign("otp_phone", { phone, exp: Date.now() / 1000 + 600 }, SECRET)]]);
  const token = `e30.${Buffer.from(JSON.stringify({ t: "cft", exp: Date.now() / 1000 + 900 })).toString("base64url")}.sig`;
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ status: "approved" })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ token_type: "bearer", entity_id: "ent-1", access_token: token, expires_in: 3600 })));
  vi.stubGlobal("fetch", fetchMock);

  const form = new FormData();
  form.set("code", "123456");
  await expect(verifyOtp(null, form)).rejects.toThrow("redirect:/onboard");
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("sendOtp: without TWILIO_API_KEY_SID a valid number signs in without an SMS", async () => {
  vi.stubEnv("PACT_SECRET_KEY", "pactlabs_sk_sentinel");
  vi.stubEnv("TWILIO_API_KEY_SID", "");
  jar.values = new Map();
  const token = `e30.${Buffer.from(JSON.stringify({ t: "cft", exp: Date.now() / 1000 + 900 })).toString("base64url")}.sig`;
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ token_type: "bearer", entity_id: "ent-1", access_token: token, expires_in: 3600 })));
  vi.stubGlobal("fetch", fetchMock);

  const bad = new FormData();
  bad.set("phone", "555");
  await expect(sendOtp(null, bad)).resolves.toHaveProperty("error");
  const form = new FormData();
  form.set("phone", "+15551234567");
  await expect(sendOtp(null, form)).rejects.toThrow("redirect:/onboard");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(String(fetchMock.mock.calls[0][0])).not.toContain("twilio");
});

function signIn(overrides: Record<string, unknown> = {}) {
  const now = Date.now() / 1000;
  const session = {
    phone: "+15551234567",
    entityId: "ent-1",
    userToken: "user-jwt",
    tokenExp: now + 3600,
    ephemeral: false,
    walletAddress: "0xabc",
    exp: now + 3600,
    ...overrides,
  };
  jar.values = new Map([["session", sign("session", session, SECRET)]]);
}

const assertion = { type: "webauthn" as const, authenticator_data: "YQ", client_data_json: "YQ", signature: "YQ" };
it.each([
  ["submitDeposit", () => submitDeposit("tx-1", assertion), "/yield/v0/transactions/tx-1/submit"],
  ["getDeposit", () => getDeposit("tx-1"), "/yield/v0/transactions/tx-1"],
  ["submitSend", () => submitSend("tx-1", assertion), "/tx-builder/v0/transactions/tx-1/signature"],
  ["getSend", () => getSend("tx-1"), "/tx-builder/v0/transactions/tx-1"],
])("%s passes the HTTP status through", async (_name, action, path) => {
  vi.stubEnv("PACT_API_BASE_URL", "https://pact.test");
  vi.stubEnv("PACT_PUBLISHABLE_KEY", "pactlabs_pub_sentinel");
  signIn();
  const fetchMock = vi.fn().mockResolvedValue(new Response("Bad Gateway", { status: 502 }));
  vi.stubGlobal("fetch", fetchMock);

  await expect(action()).resolves.toMatchObject({ status: 502 });
  expect(fetchMock.mock.calls[0][0]).toBe(`https://pact.test${path}`);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
  await expect(action()).resolves.toMatchObject({ status: 200, error: expect.stringContaining("response didn't match schema") });
});

it("buildSend sends from the session wallet to the given recipient", async () => {
  vi.stubEnv("PACT_API_BASE_URL", "https://pact.test");
  vi.stubEnv("PACT_PUBLISHABLE_KEY", "pactlabs_pub_sentinel");
  signIn();
  const built = { id: "tx-1", status: "awaiting_signature", user_op_hash: "0xhash", effects: [], expires_at: 1 };
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(built), { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
  const to = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

  await expect(buildSend(to, "2.5")).resolves.toEqual({ id: "tx-1", user_op_hash: "0xhash", effects: [], expires_at: 1 });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("https://pact.test/tx-builder/v0/transactions");
  expect(JSON.parse(init.body as string)).toMatchObject({ wallet: "0xabc", intent: { recipient: to, amount: "2.5" } });
});

describe("fundFromFaucet", () => {
  beforeEach(() => {
    faucet.address = "0xfaucet";
    faucet.mint.mockReset();
    cache.revalidatePath.mockReset();
  });

  it("mints to the session wallet and ignores client input", async () => {
    signIn();
    faucet.mint.mockResolvedValue({ txHash: "0xhash", confirmed: true });
    await expect((fundFromFaucet as (...args: unknown[]) => Promise<unknown>)("0xattacker")).resolves.toEqual({
      txHash: "0xhash",
      confirmed: true,
    });
    expect(faucet.mint).toHaveBeenCalledTimes(1);
    expect(faucet.mint).toHaveBeenCalledWith("0xabc");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/wallet");
  });

  it("passes an unconfirmed mint through and still revalidates", async () => {
    signIn();
    faucet.mint.mockResolvedValue({ txHash: "0xhash", confirmed: false });
    await expect(fundFromFaucet()).resolves.toEqual({ txHash: "0xhash", confirmed: false });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/wallet");
  });

  it("refuses when the faucet is off", async () => {
    signIn();
    faucet.address = undefined;
    await expect(fundFromFaucet()).resolves.toHaveProperty("error");
    expect(faucet.mint).not.toHaveBeenCalled();
  });

  it.each([
    ["no wallet", { walletAddress: undefined }],
    ["an ephemeral session", { ephemeral: true }],
  ])("refuses %s", async (_name, overrides) => {
    signIn(overrides);
    await expect(fundFromFaucet()).resolves.toHaveProperty("error");
    expect(faucet.mint).not.toHaveBeenCalled();
  });

  it("returns the mint error and skips revalidation", async () => {
    signIn();
    const message = "The faucet address 0xfaucet needs Arbitrum Sepolia ETH for gas.";
    faucet.mint.mockRejectedValue(new Error(message));
    await expect(fundFromFaucet()).resolves.toEqual({ error: message });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});
