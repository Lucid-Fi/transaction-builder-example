// Pact response bodies for the contract tests, redacted and trimmed. Sandbox, faucet e2e 2026-10-21 unless noted.

// sandbox, faucet e2e 2026-10-21 (access_token replaced)
export const mint = {
  token_type: "bearer", entity_id: "01a16078-2366-7222-bb2d-911f75c5e41a", access_token: "e30.e30.sig",
  expires_in: 7200,
};

// sandbox, e2e 2026-10-21 (public key arrays trimmed, org id zeroed)
export const account = {
  entity_id: "01a15ff7-d37e-7e83-9a58-7ef736665d29", org_id: "00000000-0000-0000-0000-000000000000",
  address: "0x0D163f8d7fD05905C11837B44C9fb9668A465B0B", entity_type: "user",
  sudo_key: { type: "passkey", public_key_x: Array(32).fill(7), public_key_y: Array(32).fill(7),
    credential_id: "tqm3fNnzYqpqpIPevTZxpabPX7mViaiZOnev6THMQfQ", rp_id: "localhost" },
  created_at: "2026-10-21T19:37:22.261190Z",
};

export const created = {
  entity_id: "01a16078-2366-7222-bb2d-911f75c5e41a", org_id: "00000000-0000-0000-0000-000000000000",
  address: "0xd82Ea1c84b3BA095209552c15F75C0Fa6a5Dd448", entity_type: "user",
  deployments: [
    { chain: "arbitrum-sepolia", deployed: false, entrypoint_version: "0.7", kernel_version: "3.3" },
  ],
  created_at: "2026-10-21T21:57:31.207891Z",
};

export const portfolio = {
  currency: "USD", total_value: "100.000000000000000000", total_wallet_count: 1,
  groups: [{
    grouping_key: "token_slug", grouping_value: "arbitrum-sepolia-test-usdt",
    value: "100.000000000000000000", wallet_count: 1,
    holdings: [{
      token_slug: "arbitrum-sepolia-test-usdt", token_address: "0x45d9c8b0d6402cddefe4e3965e907d29897b9c7d",
      chain: "arbitrum-sepolia", chain_id: "eip155:421614", symbol: "tUSDT", decimals: 6,
      primary_tag: "stable", currency_code: "USD",
      balance: "100.000000000000000000", price: "1", value: "100.000000000000000000",
    }],
  }],
};

const ZERO_ORG = "00000000-0000-0000-0000-000000000000";
const tx = {
  chain_id: 421614, chain_slug: "arbitrum-sepolia", ecosystem: "evm",
  tx_hash: "0xbfb84dcb35e52f6f5f3839a3759a87bb13b9dd1b78c6c833b0b974e86450c47a",
  userop_hash: "0xaaac84e5ce64843346dd2950fd5c2cb776600056cd7e26ace00286ec07e06be7",
  block_height: 321523435, timestamp: 1792619868000000, org_id: ZERO_ORG,
  entity_id: "01a16078-2366-7222-bb2d-911f75c5e41a",
  wallet_address: "0xd82ea1c84b3ba095209552c15f75c0fa6a5dd448", venue: "blockchain", active: true,
  status: "confirmed", protocol: null, gas_sponsored: true, metadata: null, created_at: 1792619872885994,
};
export const transactions = {
  data: [
    { ...tx, id: "01a16078-8273-7ae0-87af-085c69c160fa", classification: "buy", volume_usd: "1",
      tokens: ["0x31f5385bc129f37173ca88bbb25a4f8ede1d8296", "0x45d9c8b0d6402cddefe4e3965e907d29897b9c7d"],
      token_legs: [
        {
          role: "token_out", direction: "out",
          counterparty_address: "0x31f5385bc129f37173ca88bbb25a4f8ede1d8296",
          counterparty_relationship: "unrecognized",
          token_address: "0x45d9c8b0d6402cddefe4e3965e907d29897b9c7d", token_symbol: "tUSDT",
          amount_raw: "1000000", amount_decimal: "1", amount_usd: "1", event_index: 6,
        },
        {
          role: "token_in", direction: "in",
          counterparty_address: "0x0000000000000000000000000000000000000000",
          counterparty_relationship: "unrecognized",
          token_address: "0x31f5385bc129f37173ca88bbb25a4f8ede1d8296", amount_raw: "999886", event_index: 7,
        },
      ] },
    { ...tx, id: "01a16078-8273-7ae0-87af-0840d5aa55ae", classification: "wallet_deployment",
      volume_usd: null, tokens: [], token_legs: [] },
  ],
  next_cursor: null, has_more: false,
};

const campaign = {
  campaign_id: "6dc0ab27-887a-4626-86d3-114bdb67d335", name: "Direct Deposit Topup Campaign",
  description: "Rewards for setting up a direct deposit topup.", org: ZERO_ORG,
  token: {
    address: "0x45d9c8b0d6402cddefe4e3965e907d29897b9c7d", chain: "arbitrum-sepolia",
    symbol: "USDT", decimals: 6,
  },
  claim_contract: "0x6f4a4157587c2ac1d0b44ee445a5fbe5be119408", max_uses: 1,
  starts_on: 1792524883750873, ends_on: 1808163283750873, status: "active", created_on: 1792611283750873,
};
export const campaigns = { data: [campaign], cursor: null };
export const entityCampaign = {
  ...campaign, attempt: 0, rewards: { earned: "0", claimed: "0", claimable: "0", locked: "0" },
  is_accruing: false, entity_status: "eligible",
};

export const walletYield = {
  currency: "USD", updated_at: 1792619851824275, total_value: "0",
  total_earned: { total: "0", trailing_30d: "0" },
  blended_apy: { total: null, trailing_30d: null, trailing_60d: null, trailing_90d: null }, positions: [],
};
// After a 1 USDT deposit: earned is a tiny negative until yield accrues.
export const walletYieldWithPosition = {
  currency: "USD", updated_at: 1792622851742546, total_value: "0.999983006188078703087846",
  total_earned: { total: "-0.000016993811921296912154", trailing_30d: "-0.000016993811921296912154" },
  blended_apy: { total: "0.05", trailing_30d: null, trailing_60d: null, trailing_90d: null },
  positions: [{
    source_slug: "sandbox-usdt-arbitrum-sepolia", protocol: "sandbox", chain: "arbitrum-sepolia",
    wallet_address: "0xdcf48b09f4907619a27cc3ed2184aeac31d20cf5", token_slug: "arbitrum-sepolia-ptyusdt",
    token_address: "0x31f5385bc129f37173ca88bbb25a4f8ede1d8296", symbol: "ptyUSDT", decimals: 6,
    balance: "0.999881", price: "1.000102018328259766", value: "0.999983006188078703087846",
    earned: { total: "-0.000016992078417863", trailing_30d: "-0.000016992078417863" },
    incentive_earnings: [],
    earned_value: { total: "-0.000016993811921296912154", trailing_30d: "-0.000016993811921296912154" },
    apy: { total: "0.05", trailing_30d: null, trailing_60d: null, trailing_90d: null },
  }],
};

export const source = {
  source_slug: "sandbox-usdt-arbitrum-sepolia", protocol: "sandbox", chain: "arbitrum-sepolia",
  token_slug: "arbitrum-sepolia-ptyusdt",
  token_address: "0x31f5385bc129f37173ca88bbb25a4f8ede1d8296", symbol: "ptyUSDT", decimals: 6,
  apy: {
    base: "0.05", incentives: "0", total: "0.05", trailing_30d: null, trailing_60d: null, trailing_90d: null,
  },
  incentive_tokens: [], total_supply: "1100.036232", total_supply_value: "1100.036232",
  updated_at: 1792619400000000, currency: "USD",
};

// user_op trimmed to nonce/sender, effects to the first entry
export const built = {
  id: "01a16078-6f23-74c1-a0c2-3c2fa09b6963", status: "awaiting_signature", chain: "arbitrum-sepolia",
  wallet: "0xd82ea1c84b3ba095209552c15f75c0fa6a5dd448",
  validation_id: "0x017ab16ff354acb328452f1d445b3ddee9a91e9e69",
  signature_format: "webauthn",
  user_op_hash: "0xaaac84e5ce64843346dd2950fd5c2cb776600056cd7e26ace00286ec07e06be7",
  user_op: { nonce: "0x0", sender: "0xd82ea1c84b3ba095209552c15f75c0fa6a5dd448" },
  effects: [{
    type: "token_approval",
    token: { symbol: "tUSDT", address: "0x45d9c8b0d6402cddefe4e3965e907d29897b9c7d", decimals: 6 },
    amount: "1", spender: "0x31f5385bc129f37173ca88bbb25a4f8ede1d8296", amount_base_units: "1000000",
  }],
  expires_at: 1792620167000000, created_at: 1792619867940026,
};
export const submitted = {
  ...built, status: "submitted", submitted_at: 1792619868097370, finalized_at: null,
  transaction_hash: null, failure_reason: null,
};
export const confirmed = {
  ...submitted, status: "confirmed", finalized_at: 1792619870387827,
  transaction_hash: "0xbfb84dcb35e52f6f5f3839a3759a87bb13b9dd1b78c6c833b0b974e86450c47a",
};
