import "server-only";
import { call, pactUrl, userAuth } from "../http";
import { CHAIN } from "./yield";

export type AaAccount = {
  entity_id: string;
  address: string;
  sudo_key: { type: string; credential_id: string; rp_id: string };
};

export type CreatedAccount = {
  entity_id: string;
  address: string;
  deployments: { chain: string; deployed: boolean }[];
};

export async function lookupAccount(token: string, entityId: string): Promise<AaAccount | null> {
  // aa-service: POST /aa/v0/accounts/lookup ([] means no wallet yet)
  const accounts = await call<AaAccount[]>({
    label: "Look up AA wallet",
    service: "aa",
    method: "POST",
    url: pactUrl("/aa/v0/accounts/lookup"),
    headers: userAuth(token),
    json: { identifier_type: "entity_id", identifier_value: entityId },
  });
  return accounts[0] ?? null;
}

export async function createPasskeyAccount(
  token: string,
  key: { entityId: string; x: number[]; y: number[]; credentialId: string; rpId: string },
): Promise<CreatedAccount> {
  // aa-service: POST /aa/v0/accounts (x, y sent as 0x hex; 32-byte arrays also accepted)
  return call<CreatedAccount>({
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
  });
}
