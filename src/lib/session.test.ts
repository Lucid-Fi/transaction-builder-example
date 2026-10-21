import { describe, expect, it } from "vitest";
import { sign, verify, type Session } from "./session";

const secret = "test-secret-at-least-32-bytes-long!!";
const now = 1_700_000_000;
const session: Session = {
  phone: "+15551234567",
  entityId: "ent_1",
  userToken: "jwt",
  tokenExp: now + 3600,
  ephemeral: true,
  exp: now + 60,
};

describe("session cookie", () => {
  it("round-trips", () => {
    expect(verify("session", sign("session", session, secret), secret, now)).toEqual(session);
  });

  it("rejects a tampered payload", () => {
    const [, mac] = sign("session", session, secret).split(".");
    const forged = Buffer.from(JSON.stringify({ ...session, phone: "+15550000000" })).toString(
      "base64url",
    );
    expect(verify("session", `${forged}.${mac}`, secret, now)).toBeNull();
  });

  it("rejects a tampered MAC", () => {
    const cookie = sign("session", session, secret);
    const flipped = cookie.slice(0, -1) + (cookie.endsWith("A") ? "B" : "A");
    expect(verify("session", flipped, secret, now)).toBeNull();
  });

  it("rejects an expired payload", () => {
    expect(verify("session", sign("session", session, secret), secret, session.exp + 1)).toBeNull();
  });

  it("rejects a wrong secret", () => {
    expect(verify("session", sign("session", session, secret), "another-secret", now)).toBeNull();
  });

  it("rejects a cookie signed under another name", () => {
    const otp = sign("otp_phone", { phone: session.phone, exp: session.exp }, secret);
    expect(verify("session", otp, secret, now)).toBeNull();
    expect(verify("otp_phone", otp, secret, now)).not.toBeNull();
  });

  it("rejects malformed input", () => {
    expect(verify("session", "not-a-cookie", secret, now)).toBeNull();
    expect(verify("session", "a.b.c", secret, now)).toBeNull();
  });
});
