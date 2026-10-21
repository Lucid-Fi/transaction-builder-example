import "server-only";
import { ApiError, call, pactUrl, userAuth } from "../http";

export async function activate(token: string, address: string): Promise<void> {
  try {
    // WIMS: POST /wallets/v0/{wallet_address}/activate (ephemeral entity → real one)
    await call({
      label: "Activate ephemeral entity",
      service: "wims",
      method: "POST",
      url: pactUrl(`/wallets/v0/${encodeURIComponent(address)}/activate`),
      headers: userAuth(token),
    });
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 409)) throw err; // 409: already active
  }
}
