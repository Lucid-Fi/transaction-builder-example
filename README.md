# Pact Labs demo web wallet

A small Next.js app that shows how to integrate Pact Labs services end to end, only using APIs.

A built-in request inspector shows every API call the app made. 
All chain data and transactions go through Pact Labs APIs. 
The app makes no blockchain RPC calls except the optional demo faucet (see [Demo faucet](#demo-faucet-not-part-of-the-integration)).

## Prerequisites

- Node.js 22 or newer, and [pnpm](https://pnpm.io).
- A Pact Labs **sandbox** (or staging) secret key (`pactlabs_...`) and publishable key
  (`pactlabs_pub_...`).
- Optionally, a Twilio account with:
  - a **Verify service**: in the Twilio Console go to Verify → Services → Create new, enable the SMS
    channel, and copy the service SID (`VA...`);
  - an **API key**: Account → API keys & tokens → Create API key, and copy its SID (`SK...`) and secret.

  Twilio trial accounts can only send SMS to verified numbers. Without `TWILIO_API_KEY_SID` the demo
  skips the SMS code and signs in any valid number. This is for demos only: anyone who can reach the
  app can then sign in as any phone number in your Pact org.

## Setup and run

```sh
pnpm install
cp .env.example .env.local   # then fill in the values below
pnpm dev                     # open http://localhost:3000
```

| Variable | Required | What it is |
| --- | --- | --- |
| `PACT_API_BASE_URL` | no | Pact API base URL. Defaults to `https://sandbox.api.pactlabs.com`. For staging, use `https://dev.lucidfinance.xyz` and staging keys. |
| `PACT_SECRET_KEY` | yes | Pact secret key. **Server only**; used only to mint user tokens. |
| `PACT_PUBLISHABLE_KEY` | yes | Pact publishable key (browser-safe), sent with the user token on per-user calls. |
| `TWILIO_VERIFY_SERVICE_SID` | no | Twilio Verify service SID (`VA...`). Needed when `TWILIO_API_KEY_SID` is set. **Server only.** |
| `TWILIO_API_KEY_SID` | no | Twilio API key SID (`SK...`), or your Account SID (`AC...`). Leave it empty to skip SMS codes (demo only). **Server only.** |
| `TWILIO_API_KEY_SECRET` | no | The API key secret, or your Auth Token if you used the Account SID. Needed when `TWILIO_API_KEY_SID` is set. **Server only.** |
| `SESSION_SECRET` | yes | At least 32 random bytes for signing the session cookie, e.g. `openssl rand -base64 32`. **Server only.** |
| `WEBAUTHN_RP_ID` | no | Passkey relying-party ID. Defaults to `localhost`. |
| `WEBAUTHN_RELATED_ORIGINS` | no | Comma-separated origins served at `/.well-known/webauthn`. See [Passkeys on other origins and apps](#passkeys-on-other-origins-and-apps). |
| `APPLE_APP_IDS` | no | Comma-separated iOS app IDs (`TEAMID.bundle.id`) served at `/.well-known/apple-app-site-association`. |
| `ANDROID_PACKAGE_NAME` | no | Android package name served at `/.well-known/assetlinks.json`. Needs `ANDROID_SHA256_CERT_FINGERPRINTS`. |
| `ANDROID_SHA256_CERT_FINGERPRINTS` | no | Comma-separated SHA-256 signing cert fingerprints (`AA:BB:...`) for that Android app. |

No secret reaches the browser: the app reads every variable on the server and passes only the RP ID
to the passkey code.

**Passkeys need a secure context.** `http://localhost` works out of the box. On any other host,
serve the app over HTTPS and set `WEBAUTHN_RP_ID` to that domain. Passkeys are bound to the RP ID,
so a wallet created under one RP ID can't sign on another.

### Passkeys on other origins and apps

The app can serve the domain-association files that let other web origins and native apps use
passkeys for its RP ID. They only take effect when this app is served at the RP ID domain, i.e. at
`https://<WEBAUTHN_RP_ID>/.well-known/...`. Each file is read from env per request and returns 404
while its variables are unset.

- `/.well-known/webauthn` (`WEBAUTHN_RELATED_ORIGINS`): the origins listed can create and use
  passkeys for this RP ID (WebAuthn related origin requests). Browser support varies.
- `/.well-known/apple-app-site-association` (`APPLE_APP_IDS`): the `webcredentials` apps that can
  use these passkeys on iOS.
- `/.well-known/assetlinks.json` (`ANDROID_PACKAGE_NAME` and `ANDROID_SHA256_CERT_FINGERPRINTS`): a
  Digital Asset Links `get_login_creds` statement for the Android app. Served only when both are set.

The native apps also need their own setup: on iOS, the Associated Domains entitlement
`webcredentials:<WEBAUTHN_RP_ID>`; on Android, the asset statements link back to this domain.

Scripts:

| Script | Does |
| --- | --- |
| `pnpm dev` | Dev server on port 3000 |
| `pnpm build` / `pnpm start` | Production build / serve it |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest unit and API-contract tests (no network) |

## Errors

Pact services return one error envelope. `details` and `trace_id` may be `null`.

```json
{ "error": { "code": 409, "message": "the build has expired",
             "details": { "reason": "build_expired" }, "trace_id": "…" } }
```

`call()` in `src/lib/http.ts` throws an `ApiError`. Its `message` includes the server message, and
it has `status`, `reason` (`details.reason`) and `traceId`. Branch on `reason`, and quote `traceId`
to Pact support. Reasons worth handling:

- `insufficient_balance`: fund the wallet first.
- `previous_operation_pending`: wait for the last deposit to finish.
- `build_expired`, `build_superseded`: build and sign again.
- `rate_limited`: back off and retry.

Every Pact response the demo reads is checked against a zod schema next to its call in
`src/lib/pact/*.ts`; unknown fields are ignored. A 2xx body that doesn't match throws an `ApiError`
with that 2xx status and a one-line message naming the failing fields, while the inspector still
shows the real body.

No response, a 429 or a 5xx leaves the outcome unknown, so retry or check status. Other 4xx errors
are final. A 2xx that fails the schema means the server acted: don't retry it.

## Auth model

- **Secret key** (`Authorization: Bearer pactlabs_...`): server only. This app uses it for one
  thing, minting user tokens. Never ship it to a browser.
- **Publishable key + user token** (`Authorization: Bearer pactlabs_pub_...` and
  `x-pact-user-token: <jwt>`): every per-user call. Together they act only as that one user.
- Tokens are short-lived. The server re-mints shortly before expiry (`src/lib/auth.ts`) and keeps the
  token in a signed, HTTP-only session cookie (`src/lib/session.ts`).

## Passkey signing

The browser code is in `src/lib/webauthn.ts` and uses only `navigator.credentials` and
`crypto.subtle`.

- **Create:** an ES256 (P-256) passkey. Its public key x and y coordinates (32 bytes each) go to
  `POST /aa/v0/accounts` as `0x` hex strings (aa-service also accepts 32-byte arrays), with the
  base64url credential ID and the RP ID.
- **Sign:** the WebAuthn challenge is the raw 32 bytes of the `user_op_hash` returned by the build
  step (hex-decoded, not the hex string).
- **Submit:** `{ "type": "webauthn", "authenticator_data", "client_data_json", "signature" }`, all
  base64url. `signature` is the DER signature exactly as the authenticator returns it.

Pact handles the rest: signature normalisation and encoding it into the smart account's signature
format. You don't need any account-abstraction library.

## Demo faucet (not part of the integration)

The faucet is the one exception to "everything through Pact APIs". It exists only to make the demo
easier to try, and an integration doesn't need it. `src/lib/faucet.ts` mints 100 test USDT (MockUSDT)
to the signed-in wallet with a server key over EVM RPC. It is the only file allowed to import viem,
enforced by `no-restricted-imports` in `eslint.config.mjs`. Set `DEMO_FAUCET_PRIVATE_KEY` to turn it
on; its address pays gas and needs Arbitrum Sepolia ETH. `DEMO_FAUCET_RPC_URL` is optional and
defaults to the public Arbitrum Sepolia RPC. The inspector shows its RPC calls tagged
"EVM RPC (demo faucet, not a Pact API)", with the URL cut to its origin. There is no rate limit.
