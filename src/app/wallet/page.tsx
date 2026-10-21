import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { config } from "@/lib/config";
import { faucetAddress } from "@/lib/faucet";
import { ApiError } from "@/lib/http";
import { getEntityCampaign, listCampaigns, type EntityCampaign } from "@/lib/pact/incentives";
import { getChainPortfolio } from "@/lib/pact/portfolio";
import { listTransactions, type LabelledTransaction } from "@/lib/pact/transactions";
import { getSource, getWalletYield, USDT_TOKEN, YIELD_SOURCE } from "@/lib/pact/yield";
import { CopyButton } from "./copy-button";
import { DepositForm } from "./deposit-form";
import { FaucetButton } from "./faucet-button";
import { money, percent, short, tokens } from "./format";

const LABELS: Record<string, string> = {
  earn_deposit: "Deposit to Earn",
  earn_withdraw: "Withdraw from Earn",
  receive: "Received",
  transfer_out: "Sent",
};
const label = (classification: string) => LABELS[classification] ?? classification.replace(/_/g, " ");
const day = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const ENTITY_LABELS = { ineligible: "Not eligible", eligible: "Not enrolled", active: "Active", completed: "Completed" };

function Unavailable({ what, reason }: { what: string; reason: unknown }) {
  const detail =
    reason instanceof ApiError && reason.status === 0
      ? "network error"
      : reason instanceof ApiError && reason.status >= 300
        ? `HTTP ${reason.status}`
        : reason instanceof Error
          ? reason.message
          : String(reason);
  return (
    <Alert variant="destructive">
      <AlertDescription>
        {what} unavailable — {detail}, see <Link href="/inspector">Inspector</Link>.
      </AlertDescription>
    </Alert>
  );
}

function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  );
}

function Stat({ value, sub }: { value: string; sub?: string }) {
  return (
    <div>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default async function WalletPage() {
  const session = await requireSession();
  const address = session.walletAddress;
  if (!address || session.ephemeral) redirect("/onboard");
  const token = session.userToken;

  // Each card renders on its own, so one failed call doesn't blank the page.
  const [portfolio, walletYield, source, feed, campaignResult] = await Promise.allSettled([
    getChainPortfolio(token, address),
    getWalletYield(token, address),
    getSource(token),
    listTransactions(token, address),
    // The org runs a single campaign: take the first, then this entity's view of it.
    listCampaigns(token).then(({ data }) => data[0] && getEntityCampaign(token, session.entityId, data[0].campaign_id)),
  ]);

  const usdt =
    portfolio.status === "fulfilled"
      ? portfolio.value.groups
          .flatMap((g) => g.holdings ?? [])
          .find((h) => h.token_slug === USDT_TOKEN)
      : undefined;
  const position =
    walletYield.status === "fulfilled"
      ? walletYield.value.positions?.find((p) => p.source_slug === YIELD_SOURCE)
      : undefined;
  const apy = source.status === "fulfilled" ? source.value.apy : undefined;
  const campaign = campaignResult.status === "fulfilled" ? campaignResult.value : undefined;
  const claimable = campaign && tokens(campaign.rewards.claimable);
  // Deploying the account is its own zero-value row; a deposit bundled with it keeps its own row.
  const activity = feed.status === "fulfilled" ? feed.value.data.filter((tx) => tx.classification !== "wallet_deployment") : [];
  const canSign = session.rpId === config.webauthnRpId && Boolean(session.credentialId);
  const faucet = faucetAddress();

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">Wallet</h1>

      <Section title="Address" description="Fund this address with MockUSDT on Arbitrum Sepolia.">
        <div className="flex items-center gap-2">
          <code className="font-mono text-sm" title={address}>
            {short(address)}
          </code>
          <CopyButton value={address} />
        </div>
      </Section>

      {faucet && (
        <Section
          title="Demo faucet"
          description="For this demo only, not part of a Payactiv integration: real users are funded by payroll."
        >
          <p className="text-sm text-muted-foreground">
            Mints 100 test USDT to this wallet by calling the MockUSDT contract directly over EVM RPC with a
            server key. This is the app&apos;s one call that skips Pact APIs. Gas is paid by the faucet address:
          </p>
          <div className="flex items-center gap-2">
            <code className="font-mono text-sm" title={faucet}>
              {short(faucet)}
            </code>
            <CopyButton value={faucet} />
          </div>
          <FaucetButton />
        </Section>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Section title="USDT balance">
          {portfolio.status === "rejected" ? (
            <Unavailable what="Balance" reason={portfolio.reason} />
          ) : (
            <Stat
              value={`${tokens(usdt?.balance ?? "0")} ${usdt?.symbol ?? "USDT"}`}
              sub={usdt ? money(usdt.value, portfolio.value.currency) : undefined}
            />
          )}
        </Section>

        <Section title="Earn">
          {walletYield.status === "rejected" ? (
            <Unavailable what="Earn position" reason={walletYield.reason} />
          ) : !position ? (
            <p className="text-sm text-muted-foreground">No deposits yet.</p>
          ) : (
            <Stat
              value={money(position.value, walletYield.value.currency)}
              sub={`${money(position.earned_value.total, walletYield.value.currency)} earned`}
            />
          )}
        </Section>

        <Section title="Earn APY">
          {source.status === "rejected" ? (
            <Unavailable what="APY" reason={source.reason} />
          ) : (
            <Stat
              value={percent(apy?.total)}
              sub={apy?.trailing_30d != null ? `${percent(apy.trailing_30d)} trailing 30 days` : undefined}
            />
          )}
        </Section>

        <Section title="Top Up">
          {campaignResult.status === "rejected" ? (
            <Unavailable what="Top Up" reason={campaignResult.reason} />
          ) : !campaign ? (
            <p className="text-sm text-muted-foreground">No campaign yet.</p>
          ) : (
            <Stat
              value={`${tokens(campaign.rewards.earned)} ${campaign.token.symbol}`}
              sub={claimable !== "0" ? `${claimable} claimable` : undefined}
            />
          )}
        </Section>
      </div>

      {campaign && <CampaignCard campaign={campaign} />}

      <Section title="Deposit to Earn" description="One passkey signature approves and deposits in a single batch.">
        {canSign ? (
          <DepositForm credentialId={session.credentialId!} rpId={config.webauthnRpId} />
        ) : (
          <Alert>
            <AlertDescription>
              {session.credentialId
                ? `This wallet's passkey belongs to ${session.rpId || "another site"}, so it can't sign here (this app uses ${config.webauthnRpId}).`
                : "No passkey for this wallet in this session. Sign out and sign in again."}
            </AlertDescription>
          </Alert>
        )}
      </Section>

      <Section title="Activity">
        {feed.status === "rejected" ? (
          <Unavailable what="Activity" reason={feed.reason} />
        ) : activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transactions yet.</p>
        ) : (
          <ul className="divide-y">
            {activity.map((tx) => (
              <ActivityRow key={tx.id} tx={tx} />
            ))}
          </ul>
        )}
      </Section>
    </main>
  );
}

function CampaignCard({ campaign }: { campaign: EntityCampaign }) {
  const ended = `Ended ${day(campaign.ends_on / 1000)}`;
  const when = {
    pending: `Starts ${day(campaign.starts_on / 1000)}`,
    active: `Ends ${day(campaign.ends_on / 1000)}`,
    resolving: ended,
    complete: ended,
    canceled: undefined,
  }[campaign.status];
  return (
    <Section title={campaign.name} description={campaign.description}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={campaign.is_accruing ? "default" : "secondary"}
          className={campaign.status === "active" ? undefined : "capitalize"}
        >
          {campaign.status === "active" ? ENTITY_LABELS[campaign.entity_status] : campaign.status}
        </Badge>
        {when && <p className="text-sm text-muted-foreground">{when}</p>}
      </div>
    </Section>
  );
}

function ActivityRow({ tx }: { tx: LabelledTransaction }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-sm">
      <div className="space-y-0.5">
        <p className="font-medium">{label(tx.classification)}</p>
        {tx.token_legs.map((leg, i) => (
          <p key={i} className="text-muted-foreground">
            {tokens(leg.amount_decimal)} {leg.token_symbol}
            {leg.counterparty_label && ` · ${leg.counterparty_label}`}
          </p>
        ))}
      </div>
      <div className="text-right text-muted-foreground">
        <p>{new Date(tx.timestamp / 1000).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
            timeZoneName: "short",
          })}</p>
        {tx.tx_hash && <p className="font-mono text-xs">{short(tx.tx_hash)}</p>}
      </div>
    </li>
  );
}
