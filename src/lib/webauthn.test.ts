import { describe, expect, it } from "vitest";
import { b64urlDecode, b64urlEncode, hexToBytes, signUserOpHash, spkiToXY } from "./webauthn";

describe("webauthn helpers", () => {
  it("spkiToXY matches the JWK x/y of the same key", async () => {
    const { publicKey } = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ]);
    const spki = await crypto.subtle.exportKey("spki", publicKey);
    const jwk = await crypto.subtle.exportKey("jwk", publicKey);
    const { x, y } = await spkiToXY(spki);
    expect(x).toHaveLength(32);
    expect(y).toHaveLength(32);
    expect(x).toEqual(Array.from(b64urlDecode(jwk.x!)));
    expect(y).toEqual(Array.from(b64urlDecode(jwk.y!)));
  });

  it("round-trips a 43-char base64url challenge", () => {
    const s = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
    expect(s).toHaveLength(43);
    expect(b64urlEncode(b64urlDecode(s))).toBe(s);
  });

  it("encodes a user_op_hash the way pact-kernel expects in clientDataJSON", () => {
    const h = "0xfbff3f5d1e0a6c2b7e9d8c4a3b2f1e0d9c8b7a6f5e4d3c2b1a09f8e7d6c5b4a3";
    expect(b64urlEncode(hexToBytes(h))).toBe(Buffer.from(h.slice(2), "hex").toString("base64url"));
  });

  it("hexToBytes rejects odd length and non-hex", () => {
    expect(() => hexToBytes("0xabc")).toThrow();
    expect(() => hexToBytes("0xzz")).toThrow();
  });

  it("b64urlDecode rejects padding and standard-alphabet characters", () => {
    expect(() => b64urlDecode("ab==")).toThrow();
    expect(() => b64urlDecode("a+b/")).toThrow();
  });

  it("signUserOpHash rejects a hash that isn't 32 bytes before prompting", async () => {
    await expect(signUserOpHash({ hash: "0xabcd", credentialId: "AA", rpId: "localhost" })).rejects.toThrow(
      /32 bytes/,
    );
  });
});
