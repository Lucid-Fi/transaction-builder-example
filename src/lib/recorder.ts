import "server-only";

export type RecordedCall = {
  id: string;
  requestId: string; // the server request (page render or action) that made the call
  path?: string; // that request's pathname, when known
  inspectorId?: string; // the browser that made it (inspector_id cookie, src/proxy.ts); unset outside a request
  at: string;
  label: string;
  service: string;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  status: number; // 0 when the request never got a response
  responseBody: unknown;
  ms: number;
};

declare global {
  var __pactCalls: RecordedCall[] | undefined;
}

const calls = (globalThis.__pactCalls ??= []);
const MAX_CALLS = 200;

export function record(call: Omit<RecordedCall, "id">): void {
  calls.unshift({ id: crypto.randomUUID(), ...call });
  calls.length = Math.min(calls.length, MAX_CALLS);
}

/** Newest first, only that browser's calls. With no id, only calls made outside a request (tests). */
export function listCalls(inspectorId?: string): RecordedCall[] {
  return calls.filter((c) => c.inspectorId === inspectorId);
}

export type RequestGroup = { requestId: string; path?: string; at: string; calls: RecordedCall[] };

/**
 * Takes newest-first calls; returns one group per request, newest first. Within a group, calls
 * are in the order they were recorded (completion order).
 */
export function groupByRequest(newestFirst: RecordedCall[]): RequestGroup[] {
  const groups = new Map<string, RequestGroup>();
  for (const call of newestFirst.toReversed()) {
    const group = groups.get(call.requestId);
    if (group) group.calls.push(call);
    else {
      groups.set(call.requestId, {
        requestId: call.requestId,
        path: call.path,
        at: call.at,
        calls: [call],
      });
    }
  }
  return [...groups.values()].reverse();
}

const TOKEN_KEYS = new Set(["access_token", "refresh_token"]);
const prefix = (value: string) => `${value.slice(0, 16)}…`;
const PHONE = /^\+[1-9]\d{7,14}$/; // E.164, as login/actions.ts E164 validates

function redactHeader(name: string, value: string): string {
  switch (name.toLowerCase()) {
    case "authorization": {
      if (value.startsWith("Basic ")) return "Basic ***";
      const token = value.replace(/^Bearer /, "");
      const kind = token.match(/^pactlabs_(pub_)?/)?.[0] ?? "";
      return `Bearer ${kind}…${token.slice(-4)}`;
    }
    case "x-pact-user-token":
      return prefix(value);
    default:
      return value;
  }
}

function redactBody(body: unknown): unknown {
  if (typeof body === "string") return PHONE.test(body) ? `+…${body.slice(-4)}` : body;
  if (Array.isArray(body)) return body.map(redactBody);
  if (!body || typeof body !== "object") return body;
  return Object.fromEntries(
    Object.entries(body).map(([key, value]) => {
      if (TOKEN_KEYS.has(key) && typeof value === "string") return [key, prefix(value)];
      if (key === "Code") return [key, "***"]; // Twilio OTP
      return [key, redactBody(value)];
    }),
  );
}

/** Masks secrets before a call is stored for the inspector. */
export function redact(
  headers: Record<string, string>,
  body: unknown,
): { headers: Record<string, string>; body: unknown } {
  return {
    headers: Object.fromEntries(
      Object.entries(headers).map(([name, value]) => [name, redactHeader(name, value)]),
    ),
    body: redactBody(body),
  };
}
