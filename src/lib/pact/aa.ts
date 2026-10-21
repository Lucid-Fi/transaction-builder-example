import "server-only";
import { z } from "zod";
import { call, pactUrl, userAuth } from "../http";
import { CHAIN } from "./yield";

const AaAccount = z.object({
  entity_id: z.string(),
  address: z.string(),
  // credential_id and rp_id exist on passkey keys only
  sudo_key: z.object({ type: z.string(), credential_id: z.string().optional(), rp_id: z.string().optional() }),
});
export type AaAccount = z.infer<typeof AaAccount>;

// aa-service AccountResponse (not in the published OpenAPI)
const CreatedAccount = z.object({
  entity_id: z.string(),
  address: z.string(),
  deployments: z.array(z.object({ chain: z.string(), deployed: z.boolean() })),
});
export type CreatedAccount = z.infer<typeof CreatedAccount>;

export async function lookupAccount(token: string, entityId: string): Promise<AaAccount | null> {
  // aa-service: POST /aa/v0/accounts/lookup ([] means no wallet yet)
  const accounts = await call({
    label: "Look up AA wallet",
    service: "aa",
    method: "POST",
    url: pactUrl("/aa/v0/accounts/lookup"),
    headers: userAuth(token),
    json: { identifier_type: "entity_id", identifier_value: entityId },
    schema: z.array(AaAccount),
  });
  return accounts[0] ?? null;
}

export async function createPasskeyAccount(
  token: string,
  key: { entityId: string; x: number[]; y: number[]; credentialId: string; rpId: string },
): Promise<CreatedAccount> {
  // aa-service: POST /aa/v0/accounts (x, y sent as 0x hex; 32-byte arrays also accepted)
  return call({
    label: "Create passkey smart wallet",
    service: "aa",
    method: "POST",
    url: pactUrl("/aa/v0/accounts"),
    headers: userAuth(token),
    json: {
      sudo_key: {
        type: "passkey",
        public_key_x: `0x${Buffer.from(key.x).toString("hex")}`,
        public_key_y: `0x${Buffer.from(key.y).toString("hex")}`,
        credential_id: key.credentialId,
        rp_id: key.rpId,
      },
      chain: CHAIN,
      entity_id: key.entityId,
      entity_type: "user",
    },
    schema: CreatedAccount,
  });
}
