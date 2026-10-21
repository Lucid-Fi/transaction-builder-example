import "server-only";
import { call, pactUrl, serverAuth } from "../http";

export type MintedToken = {
  token_type: string;
  entity_id: string;
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

/** `entityId` keeps an ephemeral entity's id across re-mints; WIMS still resolves it once activated. */
export async function mintToken(phone: string, entityId?: string): Promise<MintedToken> {
  // Charon: POST /token-exchange/v0/tokens (dynamic issuance, secret key only)
  return call<MintedToken>({
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
