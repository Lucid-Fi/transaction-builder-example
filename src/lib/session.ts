import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { config, secureCookies } from "./config";

export type Session = {
  phone: string;
  entityId: string;
  userToken: string;
  tokenExp: number; // unix seconds
  ephemeral: boolean;
  walletAddress?: string;
  credentialId?: string;
  rpId?: string;
  exp: number; // unix seconds
};

const SESSION_COOKIE = "session";
const OTP_COOKIE = "otp_phone";
const SESSION_TTL = 12 * 60 * 60;
const OTP_TTL = 10 * 60;

const nowSeconds = () => Math.floor(Date.now() / 1000);
// The cookie name is in the MAC, so one cookie can't be replayed as another.
const mac = (name: string, data: string, secret: string) =>
  createHmac("sha256", secret).update(`${name}.${data}`).digest("base64url");

/** `base64url(JSON) + "." + base64url(HMAC-SHA256(name + "." + data))`. */
export function sign(name: string, payload: object, secret: string): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${mac(name, data, secret)}`;
}

/** Returns the payload, or null for a bad MAC, malformed input or `exp < now`. */
export function verify<T extends { exp: number }>(
  name: string,
  cookie: string,
  secret: string,
  now: number,
): T | null {
  const [data, sig, ...rest] = cookie.split(".");
  if (!data || !sig || rest.length) return null;
  const expected = Buffer.from(mac(name, data, secret));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    return typeof payload?.exp === "number" && payload.exp >= now ? payload : null;
  } catch {
    return null;
  }
}

async function readCookie<T extends { exp: number }>(name: string): Promise<T | null> {
  const value = (await cookies()).get(name)?.value;
  return value ? verify<T>(name, value, config.sessionSecret, nowSeconds()) : null;
}

async function writeCookie<T extends { exp: number }>(name: string, payload: T): Promise<void> {
  (await cookies()).set(name, sign(name, payload, config.sessionSecret), {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies,
    path: "/",
    maxAge: payload.exp - nowSeconds(),
  });
}

export function getSession(): Promise<Session | null> {
  return readCookie<Session>(SESSION_COOKIE);
}

/** Where "home" is for this visitor: sign in, finish onboarding, or the wallet. */
export function homePath(session: Session | null): string {
  if (!session) return "/login";
  return session.ephemeral || !session.walletAddress ? "/onboard" : "/wallet";
}

/** Keeps `exp` when given (an updated session), else starts a fresh 12h session. */
export async function setSession(session: Omit<Session, "exp"> & { exp?: number }): Promise<void> {
  await writeCookie(SESSION_COOKIE, { ...session, exp: session.exp ?? nowSeconds() + SESSION_TTL });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Binds the OTP check to the phone the code was sent to. */
export async function setOtpPhone(phone: string): Promise<void> {
  await writeCookie(OTP_COOKIE, { phone, exp: nowSeconds() + OTP_TTL });
}

export async function getOtpPhone(): Promise<string | null> {
  return (await readCookie<{ phone: string; exp: number }>(OTP_COOKIE))?.phone ?? null;
}
