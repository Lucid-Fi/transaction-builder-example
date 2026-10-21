import { headers } from "next/headers";
import { JsonView } from "@/components/json-view";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { groupByRequest, listCalls, type RecordedCall } from "@/lib/recorder";

export const dynamic = "force-dynamic";

const formatTime = (at: string) =>
  new Date(at).toLocaleTimeString("en-US", { hour12: false, timeZoneName: "short" });

export default async function InspectorPage() {
  const inspectorId = (await headers()).get("x-inspector-id");
  const groups = inspectorId ? groupByRequest(listCalls(inspectorId)) : [];

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Inspector</h1>
        <p className="text-sm text-muted-foreground">
          Every request this app sent to Pact Labs and Twilio, plus the demo faucet&apos;s direct EVM RPC
          calls, for this browser, grouped by the page load or action that made it, newest first. Secrets
          and phone numbers are masked.
        </p>
      </header>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No calls recorded yet. Sign in or open the wallet, then come back here.
          </CardContent>
        </Card>
      ) : (
        <ol className="space-y-8">
          {groups.map((group) => (
            <li key={group.requestId} className="space-y-3">
              <h2 className="font-mono text-sm text-muted-foreground">
                <span className="text-foreground">{group.path ?? "unknown request"}</span>
                {" · "}
                <time dateTime={group.at} className="tabular-nums">
                  {formatTime(group.at)}
                </time>
                {` · ${group.calls.length} ${group.calls.length === 1 ? "call" : "calls"}`}
              </h2>
              <ol className="space-y-4">
                {group.calls.map((call, i) => (
                  <li key={call.id}>
                    <CallCard call={call} step={i + 1} />
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}

function CallCard({ call, step }: { call: RecordedCall; step: number }) {
  const url = URL.parse(call.url);
  const ok = call.status >= 200 && call.status < 300;

  return (
    <Card>
      <CardHeader className="gap-2">
        <CardTitle>
          <h3 className="flex items-baseline gap-2">
            <span className="font-mono text-xs text-muted-foreground">#{step}</span>
            {call.label}
          </h3>
        </CardTitle>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <Badge variant="outline" className="font-mono">
            {call.method}
          </Badge>
          <span className="font-medium text-foreground">{call.service}</span>
          <Badge
            variant={ok ? "secondary" : "destructive"}
            className={
              ok
                ? "bg-emerald-600/10 font-mono text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-400"
                : "font-mono"
            }
          >
            {call.status || "no response"}
          </Badge>
          <span className="tabular-nums">{call.ms} ms</span>
          <time dateTime={call.at} className="tabular-nums">
            {formatTime(call.at)}
          </time>
        </div>
        <CardDescription className="font-mono text-xs break-all">
          {url ? (
            <>
              <span>{url.origin}</span>
              <span className="text-foreground">{url.pathname + url.search}</span>
            </>
          ) : (
            call.url
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Section title="Request headers" value={call.requestHeaders} />
        <Section title="Request body" value={call.requestBody} open />
        <Section title="Response body" value={call.responseBody} open />
      </CardContent>
    </Card>
  );
}

function Section({ title, value, open }: { title: string; value: unknown; open?: boolean }) {
  return (
    <details open={open}>
      <summary className="mb-1.5 cursor-pointer text-xs font-medium tracking-wide text-muted-foreground uppercase hover:text-foreground">
        {title}
      </summary>
      <JsonView value={value} />
    </details>
  );
}
