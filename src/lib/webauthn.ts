// Browser-side passkey helpers: only navigator.credentials and crypto.subtle, no deps.
import type { WebAuthnAssertion } from "./pact/yield";

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(str: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(str)) throw new Error("Not base64url (no padding)");
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** `"0x…"` (prefix optional) → bytes. Rejects odd length and non-hex characters. */
export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const digits = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!/^([0-9a-fA-F]{2})*$/.test(digits)) throw new Error(`Not an even-length hex string: ${hex}`);
  return Uint8Array.from(digits.match(/../g) ?? [], (h) => parseInt(h, 16));
}

/** SPKI DER P-256 public key → the 32-byte x and y coordinates aa-service expects. */
export async function spkiToXY(spki: ArrayBuffer): Promise<{ x: number[]; y: number[] }> {
  const key = await crypto.subtle.importKey("spki", spki, { name: "ECDSA", namedCurve: "P-256" }, true, [
    "verify",
  ]);
  const jwk = await crypto.subtle.exportKey("jwk", key);
  const x = b64urlDecode(jwk.x ?? "");
  const y = b64urlDecode(jwk.y ?? "");
  if (x.length !== 32 || y.length !== 32) throw new Error("Passkey public key is not a P-256 point");
  return { x: Array.from(x), y: Array.from(y) };
}

function assertWebAuthn() {
  if (typeof window === "undefined" || !window.isSecureContext || !window.PublicKeyCredential) {
    throw new Error("Passkeys need a browser with WebAuthn on a secure context (https or localhost).");
  }
}

// NotAllowedError is what browsers raise for a cancelled or timed-out prompt.
function friendly(err: unknown): never {
  if (err instanceof DOMException && err.name === "NotAllowedError") {
    throw new Error("The passkey prompt was cancelled or timed out. Try again.");
  }
  throw err;
}

export async function createPasskey({
  rpId,
  userName,
}: {
  rpId: string;
  userName: string;
}): Promise<{ x: number[]; y: number[]; credentialId: string }> {
  assertWebAuthn();
  const credential = (await navigator.credentials
    .create({
      publicKey: {
        rp: { id: rpId, name: "Pact Demo Wallet" },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: userName, displayName: userName },
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        pubKeyCredParams: [{ type: "public-key", alg: -7 }], // ES256 (P-256), what the Kernel validator verifies
        authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
        attestation: "none",
      },
    })
    .catch(friendly)) as PublicKeyCredential | null;
  if (!credential) throw new Error("No passkey was created.");

  const spki = (credential.response as AuthenticatorAttestationResponse).getPublicKey();
  if (!spki) throw new Error("The authenticator didn't return a public key.");
  // credential.id is already base64url without padding, the form aa-service hashes.
  return { ...(await spkiToXY(spki)), credentialId: credential.id };
}

/** Signs a deposit build's `user_op_hash`: the challenge is its raw 32 bytes. */
export async function signUserOpHash({
  hash,
  credentialId,
  rpId,
}: {
  hash: string;
  credentialId: string;
  rpId: string;
}): Promise<WebAuthnAssertion> {
  const challenge = hexToBytes(hash);
  if (challenge.length !== 32) throw new Error(`user_op_hash must be 32 bytes, got ${challenge.length}`);
  assertWebAuthn();
  const credential = (await navigator.credentials
    .get({
      publicKey: {
        challenge,
        rpId,
        allowCredentials: [{ type: "public-key", id: b64urlDecode(credentialId) }],
        userVerification: "required",
      },
    })
    .catch(friendly)) as PublicKeyCredential | null;
  if (!credential) throw new Error("No passkey signature was returned.");

  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    type: "webauthn",
    authenticator_data: b64urlEncode(new Uint8Array(response.authenticatorData)),
    client_data_json: b64urlEncode(new Uint8Array(response.clientDataJSON)),
    signature: b64urlEncode(new Uint8Array(response.signature)), // DER; Pact normalises high-s
  };
}
