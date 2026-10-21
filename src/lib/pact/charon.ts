import "server-only";
import { z } from "zod";
import { call, pactUrl, serverAuth } from "../http";

const MintedToken = z.object({
  token_type: z.string(),
  entity_id: z.string(),
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number(),
});
export type MintedToken = z.infer<typeof MintedToken>;

/** `entityId` keeps an ephemeral entity's id across re-mints; WIMS still resolves it once activated. */
export async function mintToken(phone: string, entityId?: string): Promise<MintedToken> {
  // Charon: POST /token-exchange/v0/tokens (dynamic issuance, secret key only)
  return call({
    label: "Mint user token (dynamic issuance)",
    service: "charon",
    method: "POST",
    url: pactUrl("/token-exchange/v0/tokens"),
    headers: serverAuth(),
    json: {
      grant_type: "auto",
      ...(entityId && { entity_id: entityId }),
      identifiers: [{ identifier_type: "phone_number", value: phone }],
    },
    schema: MintedToken,
  });
}

// No signature check: the token came straight from Charon over TLS.
function claims(jwt: string): { t?: string; exp: number } {
  return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
}

/** Ephemeral (counterfactual) tokens carry `t: "cft"`: no WIMS entity exists yet. */
export function isEphemeral(jwt: string): boolean {
  return claims(jwt).t === "cft";
}

/** Unix seconds. */
export function tokenExpiry(jwt: string): number {
  return claims(jwt).exp;
}
