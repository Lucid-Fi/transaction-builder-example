import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireSession } from "./auth";
import { sign, verify, type Session } from "./session";

const jar = vi.hoisted(() => ({
  values: new Map<string, string>(),
  failSet: false,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.values.has(name) ? { value: jar.values.get(name) } : undefined),
    set: (name: string, value: string) => {
      if (jar.failSet) throw new Error("Cookies can only be modified in a Server Action");
      jar.values.set(name, value);
    },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

const SECRET = "test-secret-at-least-32-bytes-long!!";
const now = () => Math.floor(Date.now() / 1000);
const jwt = (claims: object) =>
  `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;

let fetchMock: ReturnType<typeof vi.fn>;

function session(overrides: Partial<Session> = {}): Session {
  return {
    phone: "+15551234567",
    entityId: "ent-old",
    userToken: "old-jwt",
    tokenExp: now() + 3600,
    ephemeral: false,
    exp: now() + 600,
    ...overrides,
  };
}

const store = (s: object, name = "session") => jar.values.set(name, sign(name, s, SECRET));

function minted(claims: object, entityId = "ent-new") {
  const access_token = jwt(claims);
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ token_type: "bearer", entity_id: entityId, access_token })),
  );
  return access_token;
}

beforeEach(() => {
  jar.values.clear();
  jar.failSet = false;
  vi.stubEnv("SESSION_SECRET", SECRET);
  vi.stubEnv("PACT_SECRET_KEY", "pactlabs_sk_sentinel");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  // Pin the clock so repeated now() calls can't straddle a second boundary.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("requireSession", () => {
  it("redirects without a session", async () => {
    await expect(requireSession()).rejects.toThrow("redirect:/login");
  });

  it("redirects on an otp_phone cookie replayed as the session", async () => {
    jar.values.set("session", sign("otp_phone", { phone: "+15551234567", exp: now() + 600 }, SECRET));
    await expect(requireSession()).rejects.toThrow("redirect:/login");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("redirects on a validly signed but malformed session", async () => {
    store({ phone: "+15551234567", exp: now() + 600 });
    await expect(requireSession()).rejects.toThrow("redirect:/login");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the session as is when the token has more than 60s left", async () => {
    const s = session();
    store(s);
    expect(await requireSession()).toEqual(s);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("re-mints a standard token without entity_id, keeping exp", async () => {
    const s = session({ tokenExp: now() + 30 });
    store(s);
    const token = minted({ sub: "ent-new", exp: now() + 900 });

    const next = await requireSession();

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body).not.toHaveProperty("entity_id");
    expect(next).toEqual({
      ...s,
      userToken: token,
      tokenExp: now() + 900,
      entityId: "ent-new",
      ephemeral: false,
    });
    expect(verify("session", jar.values.get("session")!, SECRET, now())).toEqual(next);
  });

  it("re-mints an ephemeral token with its entity_id", async () => {
    const s = session({ tokenExp: now() - 10, ephemeral: true });
    store(s);
    const token = minted({ sub: "ent-old", t: "cft", exp: now() + 900 }, "ent-old");

    const next = await requireSession();

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.entity_id).toBe("ent-old");
    expect(next).toMatchObject({ userToken: token, entityId: "ent-old", ephemeral: true, exp: s.exp });
  });

  it("returns the re-minted session when the cookie can't be written", async () => {
    store(session({ tokenExp: now() + 30 }));
    const token = minted({ sub: "ent-new", exp: now() + 900 });
    jar.failSet = true;

    expect((await requireSession()).userToken).toBe(token);
  });
});
