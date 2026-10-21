# Pact Labs demo web wallet

A small Next.js app that shows how to integrate Pact Labs services end to end. A user signs in with
their phone number (SMS code via Twilio Verify). The server then issues a dynamic Pact user token
linked to an entity, and the user creates a passkey-controlled smart wallet. The wallet page shows
balances, Earn APY and earnings, a Top Up stat and a campaign card (only what the incentives API
returns), a one-signature deposit to Earn and labelled activity. A built-in request inspector shows
every API call the app made. All chain data and transactions go through Pact Labs APIs; the app
makes no blockchain RPC calls except the optional demo faucet (see
[Demo faucet](#demo-faucet-not-part-of-the-integration)).

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

## How the integration works

1. **Sign in** (`/login`): Twilio Verify sends an SMS code and then checks it. Without
   `TWILIO_API_KEY_SID` the app skips the code and signs in any valid number (demo only).
2. **Issue a user token**: the server mints a Pact user token for the phone number with the secret
   key (`grant_type: "auto"`). Pact links the phone to an existing entity, or returns an ephemeral
   token for a new user (see [Auth model](#auth-model)).
3. **Wallet check**: for an existing entity, the server looks up its smart wallet. If it has none,
   or the token is ephemeral, the user goes to `/onboard`.
4. **Create the wallet** (`/onboard`): the browser creates a P-256 passkey. The server creates a
   smart account whose owner key is that passkey. For an ephemeral entity it then activates the entity
   against the new wallet address and mints a fresh, standard token.
5. **Wallet page** (`/wallet`): balances, Earn position and earnings, Earn APY, a Top Up stat
   (campaign rewards earned, plus claimable when there is any), a campaign card (name, description,
   status, dates, as the incentives API returns them) and labelled activity, fetched in parallel.
   Each card fails on its own.
6. **Deposit**: Pact builds the yield deposit (approve and deposit in one batch) and returns a
   `user_op_hash`. The passkey signs it in the browser. Then the browser drives a loop through
   Server Actions (`src/app/wallet/settle.ts`), every 2 s:
   - It submits the signature. No response, a 429 or a 5xx means the outcome is unknown and the
     deposit may still land, so it submits again with the same signature until Pact answers. A
     repeat returns the current state.
   - Then it polls `GET /yield/v0/transactions/{id}` until a terminal status (`TERMINAL` in
     `src/lib/pact/yield.ts`: `confirmed`, `failed`, `expired`, `superseded`, `invalid`).
   - Any other 4xx is final. The loop gives up 90 s after the build's `expires_at`.

| Step | Pact service and route | Auth | Code |
| --- | --- | --- | --- |
| Send / check SMS code | Twilio Verify `POST /v2/Services/{sid}/Verifications`, `POST /v2/Services/{sid}/VerificationCheck` | Twilio basic auth | `src/lib/twilio.ts` `startVerification`, `checkVerification` |
| Mint user token | Token exchange `POST /token-exchange/v0/tokens` | Secret key | `src/lib/pact/charon.ts` `mintToken` |
| Look up wallet | AA `POST /aa/v0/accounts/lookup` | Publishable key + user token | `src/lib/pact/aa.ts` `lookupAccount` |
| Create passkey wallet | AA `POST /aa/v0/accounts` | Publishable key + user token | `src/lib/pact/aa.ts` `createPasskeyAccount` |
| Activate ephemeral entity | Wallets `POST /wallets/v0/{address}/activate` | Publishable key + user token | `src/lib/pact/wims.ts` `activate` |
| Balances | Portfolio `GET /portfolio/v0/chains/{chain}/wallets/{address}/portfolio` | Publishable key + user token | `src/lib/pact/portfolio.ts` `getChainPortfolio` |
| Yield position and earnings | Yield `GET /yield/v0/wallets/{address}` | Publishable key + user token | `src/lib/pact/yield.ts` `getWalletYield` |
| Yield APY | Yield `GET /yield/v0/sources/{source_slug}` | Publishable key + user token | `src/lib/pact/yield.ts` `getSource` |
| Build deposit | Yield `POST /yield/v0/wallets/{address}/deposits/build` | Publishable key + user token | `src/lib/pact/yield.ts` `buildDeposit` |
| Submit signature | Yield `POST /yield/v0/transactions/{id}/submit` | Publishable key + user token | `src/lib/pact/yield.ts` `submitSignature` |
| Poll status | Yield `GET /yield/v0/transactions/{id}` | Publishable key + user token | `src/lib/pact/yield.ts` `getTransaction` |
| Labelled activity | Transactions `GET /transactions/v0/transactions` | Publishable key + user token | `src/lib/pact/transactions.ts` `listTransactions` |
| Incentive campaign | Incentives `GET /incentives/campaigns` | Publishable key + user token | `src/lib/pact/incentives.ts` `listCampaigns` |
| Campaign status and rewards | Incentives `GET /incentives/entities/{entityId}/campaigns/{campaignId}` | Publishable key + user token | `src/lib/pact/incentives.ts` `getEntityCampaign` |

The chain is `arbitrum-sepolia`, the yield source is `sandbox-usdt-arbitrum-sepolia` and the USDT
token is the token-info slug `arbitrum-sepolia-test-usdt` (all three in `src/lib/pact/yield.ts`).
The yield-source and token slugs are per-environment data (yield and token-info), so check them when
you change `PACT_API_BASE_URL`. `src/lib/pact/contract.test.ts` pins the exact URL, method, auth
headers and body of every call.

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

No response, a 429 or a 5xx leaves the outcome unknown, so retry or check status. Other 4xx errors
are final.

## Auth model

- **Secret key** (`Authorization: Bearer pactlabs_...`): server only. This app uses it for one
  thing, minting user tokens. Never ship it to a browser.
- **Publishable key + user token** (`Authorization: Bearer pactlabs_pub_...` and
  `x-pact-user-token: <jwt>`): every per-user call. Together they act only as that one user.
- **Ephemeral tokens.** When the phone number matches no entity yet, the mint returns an ephemeral
  (counterfactual) token, marked by the JWT claim `t: "cft"`. It is enough to create a wallet. After
  the wallet exists, `POST /wallets/v0/{address}/activate` turns the ephemeral entity into a real one
  linked to the phone, and a re-mint with the same `entity_id` returns a standard token.
- Tokens are short-lived. The server re-mints shortly before expiry (`src/lib/auth.ts`) and keeps the
  token in a signed, HTTP-only session cookie (`src/lib/session.ts`).

The publishable key is browser-safe. This demo still makes every Pact call on the server (Server
Components and Server Actions) so that all traffic passes through `call()` in `src/lib/http.ts`,
which records it for the inspector. Wherever your app makes its per-user calls, keep the secret key
and the token mint on your backend.

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

## Request inspector

`/inspector` lists every Pact and Twilio request (and the demo faucet's EVM RPC calls) the server
made for this browser, grouped per request (page load or action), newest first: method, URL,
status, latency, and the request and response JSON. Each browser sees only its own calls.
`src/proxy.ts` gives it a random httpOnly `inspector_id` cookie and tags its calls with it.
Secrets are masked before storage: API keys show only their prefix and last four characters, user
tokens and `access_token` / `refresh_token` values are truncated, Twilio credentials and OTP codes
become `***`, and phone numbers show only their last four digits (`+…4567`). Entity ids, wallet
addresses and balances still show to that browser.

The log is in memory, per server process, and holds the last 200 calls across all browsers, so
busy traffic can push out yours. In `next dev` a
hot reload re-renders the page, so it adds a new group.

## Incentives API

Partners use it to show a user's campaign rewards and let them claim. The wallet page lists the
org's campaigns, takes the first (the org runs one) and fetches the entity's view of it. The Top Up
and campaign cards show only what the API returns, and the API is expected to change. The entity
route returns an `eligible` item with zero rewards when the entity isn't enrolled; the entity *list*
route only returns enrolled campaigns. Routes are under `/incentives` with **no version segment**,
e.g. `GET /incentives/entities/{entityId}/rewards`.

Auth is the publishable key plus user token, like the other per-user calls. `{entityId}` must be
the user token's entity, i.e. the `entity_id` returned by the token mint (this demo keeps it as
`entityId` in the session), or you get 403. A publishable key without a user token gets 401. The
secret key also works and can read any entity in its org. Campaign lists
only show the caller's org.

| Route | Returns |
| --- | --- |
| `GET /incentives/entities/{entityId}/rewards` | Campaigns completed and active, total value, and per token `rewards` {`earned`, `claimed`, `claimable`, `locked`} plus `value` (null when the token has no price) |
| `GET /incentives/campaigns`, `GET /incentives/orgs/{orgId}/campaigns` | The org's campaign catalog (token, claim contract, payout caps, start/end, status) |
| `GET /incentives/entities/{entityId}/campaigns` | Campaigns the entity is enrolled in, with its attempt, rewards, `is_accruing` and `entity_status` |
| `GET /incentives/entities/{entityId}/campaigns/{campaignId}` | One campaign for the entity |
| `POST /incentives/entities/{entityId}/claim-authorizations` | Signed claim authorizations; body `{ "recipient": "0x…", "campaigns"?: [uuid] }` |
| `GET /incentives/entities/{entityId}/claims` | Claim history (amount, tx hash, chain, status) |

- Amounts are whole-token decimal strings, not base units, with
  `earned = claimed + claimable + locked`.
- Times are microseconds.
- Lists page with `cursor` and `count` (default 50, max 100) and filter with `status` (plus
  `entity_status` on entity campaigns and `campaign_id` on claims). Statuses: campaign
  `pending|active|resolving|canceled|complete`; entity `ineligible|eligible|active|completed`;
  claim `pending|confirmed`.
- `currency` is a 3-letter code and defaults to USD.

Claiming: each authorization (one per token) carries the claim contract, chain, recipient,
cumulative claim entries, `expires_at` and an EIP-712 `signature` (domain `PactIncentivesClaim`
v1, verifying contract = the campaign's claim contract). The client submits it to the claim
contract itself; no Pact route submits claims.

The routes are served on staging; the live demo's Top Up and campaign cards load from them.
Campaign authoring isn't public and returns 501. Claim authorizations return 501 on staging.
Payroll / direct-deposit events aren't wired in yet, so every entity reads `eligible` with zero
rewards, and the campaign card shows "Not enrolled" while the campaign is active. The API also
returns `eligible` for an entity that's enrolled but hasn't qualified, so "Not enrolled" may be
wrong once enrolment is wired.

## Demo faucet (not part of the integration)

The faucet is the one exception to "everything through Pact APIs". It exists only to make the demo
easier to try, and an integration doesn't need it. `src/lib/faucet.ts` mints 100 test USDT (MockUSDT)
to the signed-in wallet with a server key over EVM RPC. It is the only file allowed to import viem,
enforced by `no-restricted-imports` in `eslint.config.mjs`. Set `DEMO_FAUCET_PRIVATE_KEY` to turn it
on; its address pays gas and needs Arbitrum Sepolia ETH. `DEMO_FAUCET_RPC_URL` is optional and
defaults to the public Arbitrum Sepolia RPC. The inspector shows its RPC calls tagged
"EVM RPC (demo faucet, not a Pact API)", with the URL cut to its origin. There is no rate limit.
A Payactiv integration should delete it:

- `src/lib/faucet.ts`, `src/lib/faucet.test.ts` and `src/app/wallet/faucet-button.tsx`
- `fundFromFaucet` and its `@/lib/faucet` and `next/cache` imports in `src/app/wallet/actions.ts`, and
  its tests, its name in the `./wallet/actions` import and the `@/lib/faucet`/`next/cache` mocks in
  `src/app/actions.test.ts`
- the "Demo faucet" card, its two imports and `const faucet` in `src/app/wallet/page.tsx`
- the `export` on `currentRequest` in `src/lib/http.ts` (only the faucet uses it)
- the `DEMO_FAUCET_*` lines and their comments in `.env.example`, the viem rule in `eslint.config.mjs`
  and the viem dependency
- the faucet wording in this README and in the `/inspector` intro (`src/app/inspector/page.tsx`)

## Notes and limitations

- **Fund the wallet before depositing.** A new wallet is empty. Your Pact Labs contact provides
  test MockUSDT on Arbitrum Sepolia (its contract address is in token-info:
  `GET /token-info/v0/tokens/arbitrum-sepolia-test-usdt` on the Pact API, no auth); send it to the
  wallet address (the address card has a copy button), or, when the demo faucet is on, use its
  button on `/wallet`; then deposit.
- Demo shortcuts not to copy to production: the in-memory inspector; no WebAuthn attestation or
  registration-challenge verification; single-process state; near expiry, every page render
  re-mints the user token until a Server Action saves it, because Server Components can't set
  cookies (`src/lib/auth.ts`).

## Project layout

```
src/
  app/
    login/        phone + SMS code sign-in (actions.ts: Twilio, token mint, wallet lookup)
    onboard/      passkey creation and wallet creation/activation
    wallet/       wallet page, deposit form (settle.ts: submit/poll loop), demo faucet button
    inspector/    request inspector
    .well-known/  passkey domain association: webauthn, apple-app-site-association, assetlinks.json
  lib/
    pact/         one file per Pact service: charon, aa, wims, portfolio, yield, transactions,
                  incentives
    http.ts       call(): the single Pact and Twilio fetch, auth headers, recording
    faucet.ts     DEMO ONLY: MockUSDT faucet, the app's one direct EVM RPC call (viem)
    recorder.ts   inspector store and secret masking
    auth.ts       session guard and token refresh
    session.ts    signed session cookie
    twilio.ts     Twilio Verify
    webauthn.ts   browser passkey create/sign helpers
    config.ts     env vars
  proxy.ts        request ids for inspector grouping, per-browser inspector cookie
```
