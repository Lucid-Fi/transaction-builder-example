import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listCalls } from "../recorder";
import { checkVerification, startVerification } from "../twilio";
import { createPasskeyAccount, lookupAccount } from "./aa";
import { isEphemeral, mintToken, tokenExpiry } from "./charon";
import { getEntityCampaign, listCampaigns } from "./incentives";
import { getChainPortfolio } from "./portfolio";
import { listTransactions } from "./transactions";
import { activate } from "./wims";
import { buildDeposit, getSource, getTransaction, getWalletYield, submitSignature } from "./yield";

const BASE = "https://pact.test";
const SK = { authorization: "Bearer pactlabs_sk_sentinel" };
const USER = { authorization: "Bearer pactlabs_pub_sentinel", "x-pact-user-token": "user-jwt" };
const ADDR = "0xabc";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("PACT_API_BASE_URL", BASE);
  vi.stubEnv("PACT_SECRET_KEY", "pactlabs_sk_sentinel");
  vi.stubEnv("PACT_PUBLISHABLE_KEY", "pactlabs_pub_sentinel");
  fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** The single request the call made: url, method, auth headers and parsed JSON body. */
function sent() {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  const headers = init.headers as Record<string, string>;
  return {
    url,
    method: init.method,
    auth: {
      authorization: headers.authorization,
      ...(headers["x-pact-user-token"] && { "x-pact-user-token": headers["x-pact-user-token"] }),
    },
    body: init.body === undefined ? undefined : JSON.parse(init.body as string),
  };
}

const jwt = (claims: object) =>
  `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;

describe("Pact contracts", () => {
  it("charon mintToken: SK only, auto grant by phone; recorded with secrets masked", async () => {
    const token = jwt({ sub: "ent-1", exp: 1 });
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ token_type: "bearer", entity_id: "ent-1", access_token: token }), {
        status: 200,
      }),
    );
    await mintToken("+15551234567");
    expect(sent()).toEqual({
      url: `${BASE}/token-exchange/v0/tokens`,
      method: "POST",
      auth: SK,
      body: {
        grant_type: "auto",
        identifiers: [{ identifier_type: "phone_number", value: "+15551234567" }],
      },
    });
    const [recorded] = listCalls();
    expect(recorded.requestHeaders.authorization).toBe("Bearer pactlabs_…inel");
    const masked = (recorded.responseBody as { access_token: string }).access_token;
    expect(masked).toMatch(/…$/);
    expect(masked).not.toBe(token);
  });

  it("charon mintToken: sends entity_id when given", async () => {
    await mintToken("+15551234567", "ent-1");
    expect(sent().body).toEqual({
      grant_type: "auto",
      entity_id: "ent-1",
      identifiers: [{ identifier_type: "phone_number", value: "+15551234567" }],
    });
  });

  it("aa lookupAccount", async () => {
    fetchMock.mockResolvedValueOnce(new Response("[]", { status: 200 }));
    expect(await lookupAccount("user-jwt", "ent-1")).toBeNull();
    expect(sent()).toEqual({
      url: `${BASE}/aa/v0/accounts/lookup`,
      method: "POST",
      auth: USER,
      body: { identifier_type: "entity_id", identifier_value: "ent-1" },
    });
  });

  it("aa lookupAccount returns the first account", async () => {
    const account = { entity_id: "ent-1", address: ADDR, sudo_key: {} };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([account, { address: "0xdef" }])));
    expect(await lookupAccount("user-jwt", "ent-1")).toEqual(account);
  });

  it("aa createPasskeyAccount", async () => {
    const x = Array.from({ length: 32 }, (_, i) => i);
    const y = Array.from({ length: 32 }, (_, i) => 0xe0 + i);
    await createPasskeyAccount("user-jwt", {
      entityId: "ent-1", x, y, credentialId: "cred", rpId: "localhost",
    });
    expect(sent()).toEqual({
      url: `${BASE}/aa/v0/accounts`,
      method: "POST",
      auth: USER,
      body: {
        sudo_key: {
          type: "passkey",
          public_key_x: "0x000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
          public_key_y: "0xe0e1e2e3e4e5e6e7e8e9eaebecedeeeff0f1f2f3f4f5f6f7f8f9fafbfcfdfeff",
          credential_id: "cred",
          rp_id: "localhost",
        },
        chain: "arbitrum-sepolia",
        entity_id: "ent-1",
        entity_type: "user",
      },
    });
  });

  it("wims activate: no body", async () => {
    await activate("user-jwt", ADDR);
    expect(sent()).toEqual({
      url: `${BASE}/wallets/v0/${ADDR}/activate`,
      method: "POST",
      auth: USER,
      body: undefined,
    });
  });

  it("wims activate treats 409 as success, other errors throw", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 409 }));
    await expect(activate("user-jwt", ADDR)).resolves.toBeUndefined();
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    await expect(activate("user-jwt", ADDR)).rejects.toMatchObject({ status: 500 });
  });

  it("portfolio getChainPortfolio", async () => {
    await getChainPortfolio("user-jwt", ADDR);
    expect(sent()).toEqual({
      url: `${BASE}/portfolio/v0/chains/arbitrum-sepolia/wallets/${ADDR}/portfolio?include_holdings=true&group_by=token_slug`,
      method: "GET",
      auth: USER,
      body: undefined,
    });
  });

  it("yield getWalletYield", async () => {
    await getWalletYield("user-jwt", ADDR);
    expect(sent()).toEqual({
      url: `${BASE}/yield/v0/wallets/${ADDR}?include_positions=true`,
      method: "GET",
      auth: USER,
      body: undefined,
    });
  });

  it("yield getSource", async () => {
    await getSource("user-jwt");
    expect(sent()).toEqual({
      url: `${BASE}/yield/v0/sources/sandbox-usdt-arbitrum-sepolia`,
      method: "GET",
      auth: USER,
      body: undefined,
    });
  });

  it("yield buildDeposit", async () => {
    await buildDeposit("user-jwt", ADDR, "10.5");
    expect(sent()).toEqual({
      url: `${BASE}/yield/v0/wallets/${ADDR}/deposits/build`,
      method: "POST",
      auth: USER,
      body: { source_slug: "sandbox-usdt-arbitrum-sepolia", amount: "10.5" },
    });
  });

  // WebAuthn signing is a browser ceremony, not a network call; its output is submitSignature's body.
  it("yield submitSignature", async () => {
    await submitSignature("user-jwt", "tx-1", {
      type: "webauthn", authenticator_data: "ad", client_data_json: "cd", signature: "sig",
    });
    expect(sent()).toEqual({
      url: `${BASE}/yield/v0/transactions/tx-1/submit`,
      method: "POST",
      auth: USER,
      body: { type: "webauthn", authenticator_data: "ad", client_data_json: "cd", signature: "sig" },
    });
  });

  it("yield getTransaction: id is path-encoded", async () => {
    await getTransaction("user-jwt", "a/b");
    expect(sent()).toEqual({
      url: `${BASE}/yield/v0/transactions/a%2Fb`,
      method: "GET",
      auth: USER,
      body: undefined,
    });
  });

  it("transactions listTransactions, with cursor and filters", async () => {
    await listTransactions("user-jwt", ADDR);
    expect(sent()).toEqual({
      url: `${BASE}/transactions/v0/transactions?wallet_addresses=${ADDR}&count=20`,
      method: "GET",
      auth: USER,
      body: undefined,
    });
    fetchMock.mockClear();
    await listTransactions("user-jwt", ADDR, { cursor: "c1" });
    expect(sent().url).toBe(
      `${BASE}/transactions/v0/transactions?wallet_addresses=${ADDR}&count=20&cursor=c1`,
    );
    fetchMock.mockClear();
    await listTransactions("user-jwt", ADDR, { classifications: "cash_in,receive", count: "100", from: "1" });
    expect(sent().url).toBe(
      `${BASE}/transactions/v0/transactions?wallet_addresses=${ADDR}&count=100&classifications=cash_in%2Creceive&from=1`,
    );
  });

  it("incentives listCampaigns", async () => {
    await listCampaigns("user-jwt");
    expect(sent()).toEqual({
      url: `${BASE}/incentives/campaigns`,
      method: "GET",
      auth: USER,
      body: undefined,
    });
  });

  it("incentives getEntityCampaign: ids are path-encoded", async () => {
    await getEntityCampaign("user-jwt", "ent-1", "c/1");
    expect(sent()).toEqual({
      url: `${BASE}/incentives/entities/ent-1/campaigns/c%2F1`,
      method: "GET",
      auth: USER,
      body: undefined,
    });
  });
});

describe("call() network failure", () => {
  it("throws ApiError with status 0 and records the call", async () => {
    const cause = new TypeError("fetch failed");
    fetchMock.mockRejectedValueOnce(cause);
    await expect(lookupAccount("user-jwt", "ent-1")).rejects.toMatchObject({
      name: "ApiError",
      status: 0,
      cause,
    });
    expect(listCalls()[0]).toMatchObject({ label: "Look up AA wallet", status: 0 });
  });
});

describe("call() error envelope", () => {
  const submit = () =>
    submitSignature("user-jwt", "tx-1", {
      type: "webauthn", authenticator_data: "ad", client_data_json: "cd", signature: "sig",
    }).catch((e) => e);

  it("uses the server message, reason and trace id", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      error: { code: 409, message: "the build has expired", details: { reason: "build_expired" }, trace_id: "t-1" },
    }), { status: 409 }));
    const err = await submit();
    expect(err.message).toBe("Submit passkey signature failed: the build has expired (HTTP 409)");
    expect(err.status).toBe(409);
    expect(err.reason).toBe("build_expired");
    expect(err.traceId).toBe("t-1");
  });

  it("falls back to the HTTP status for a non-JSON body", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Bad Gateway", { status: 502 }));
    const err = await submit();
    expect(err.message).toBe("Submit passkey signature failed: HTTP 502");
    expect(err.reason).toBeUndefined();
  });

  it("null details and trace_id read as undefined", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      error: { message: "x", details: null, trace_id: null },
    }), { status: 500 }));
    const err = await submit();
    expect(err.reason).toBeUndefined();
    expect(err.traceId).toBeUndefined();
  });
});

describe("Twilio Verify", () => {
  beforeEach(() => {
    vi.stubEnv("TWILIO_VERIFY_SERVICE_SID", "VA1");
    vi.stubEnv("TWILIO_API_KEY_SID", "SK1");
    vi.stubEnv("TWILIO_API_KEY_SECRET", "secret");
  });

  function sentForm() {
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    return {
      url,
      method: init.method,
      authorization: headers.authorization,
      contentType: headers["content-type"],
      form: Object.fromEntries(new URLSearchParams(init.body as string)),
    };
  }

  const basic = `Basic ${Buffer.from("SK1:secret").toString("base64")}`;

  it("startVerification", async () => {
    await startVerification("+15551234567");
    expect(sentForm()).toEqual({
      url: "https://verify.twilio.com/v2/Services/VA1/Verifications",
      method: "POST",
      authorization: basic,
      contentType: "application/x-www-form-urlencoded",
      form: { To: "+15551234567", Channel: "sms" },
    });
  });

  it("checkVerification: approved only", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ status: "approved" })));
    expect(await checkVerification("+15551234567", "123456")).toBe(true);
    expect(sentForm()).toEqual({
      url: "https://verify.twilio.com/v2/Services/VA1/VerificationCheck",
      method: "POST",
      authorization: basic,
      contentType: "application/x-www-form-urlencoded",
      form: { To: "+15551234567", Code: "123456" },
    });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ status: "pending" })));
    expect(await checkVerification("+15551234567", "000000")).toBe(false);
  });
});

describe("Charon token claims", () => {
  it("isEphemeral: t=cft is ephemeral, no t is not", () => {
    expect(isEphemeral(jwt({ sub: "e", t: "cft", exp: 1 }))).toBe(true);
    expect(isEphemeral(jwt({ sub: "e", exp: 1 }))).toBe(false);
  });

  it("tokenExpiry reads exp", () => {
    expect(tokenExpiry(jwt({ exp: 1_700_000_000 }))).toBe(1_700_000_000);
  });
});
