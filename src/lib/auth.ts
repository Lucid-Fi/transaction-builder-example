import "server-only";
import { redirect } from "next/navigation";
import { isEphemeral, mintToken, tokenExpiry } from "./pact/charon";
import { getSession, setSession, type Session } from "./session";

const isSession = (s: Session | null): s is Session =>
  typeof s?.tokenExp === "number" && typeof s.userToken === "string" && typeof s.phone === "string";

/** Guard for pages and actions: redirects to /login, re-mints the user token when it is about to expire. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!isSession(session)) redirect("/login");
  if (session.tokenExp - Date.now() / 1000 >= 60) return session;

  const minted = await mintToken(session.phone, session.ephemeral ? session.entityId : undefined);
  const next = {
    ...session,
    userToken: minted.access_token,
    tokenExp: tokenExpiry(minted.access_token),
    entityId: minted.entity_id,
    ephemeral: isEphemeral(minted.access_token),
  };
  try {
    await setSession(next);
  } catch {
    // Server Components can't set cookies; a later Server Action persists the token.
  }
  return next;
}
