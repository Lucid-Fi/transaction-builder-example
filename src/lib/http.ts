import "server-only";
import { headers as requestHeaders } from "next/headers";
import type { ZodType } from "zod";
import { config } from "./config";
import { record, redact } from "./recorder";

/** `status` is 0 when there was no response; a 2xx status means the body failed the call's response schema. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ApiError";
  }

  /** `error.details.reason`: a stable snake_case code to branch on (e.g. insufficient_balance). */
  get reason(): string | undefined {
    return pactError(this.body)?.details?.reason ?? undefined;
  }

  /** `error.trace_id`: quote it to Pact support. Null when the service has tracing off. */
  get traceId(): string | undefined {
    return pactError(this.body)?.trace_id ?? undefined;
  }
}

type CallOptions<T> = {
  label: string; // human step name, shown as the inspector card title
  service: string;
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  json?: unknown;
  form?: Record<string, string>;
  schema?: ZodType<T>; // checked after a 2xx; a mismatch throws ApiError with that 2xx status
};

function parse(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

type PactError = { message?: unknown; details?: { reason?: string } | null; trace_id?: string | null };

/** Pact's error envelope: {"error": {"code", "message", "details": {"reason"}, "trace_id"}}. */
function pactError(body: unknown): PactError | undefined {
  const error = (body as { error?: unknown } | null)?.error;
  return error && typeof error === "object" ? (error as PactError) : undefined;
}

/** Request id, path and inspector id stamped by src/proxy.ts; outside a request (tests), a fresh id per call. */
export async function currentRequest(): Promise<{ requestId: string; path?: string; inspectorId?: string }> {
  try {
    const h = await requestHeaders();
    const requestId = h.get("x-request-id");
    if (requestId) {
      return {
        requestId,
        path: h.get("x-pathname") ?? undefined,
        inspectorId: h.get("x-inspector-id") ?? undefined,
      };
    }
  } catch {} // no request scope (unit tests)
  return { requestId: crypto.randomUUID() };
}

/** Every Pact and Twilio request goes through here and is recorded. */
export async function call<T>(opts: CallOptions<T>): Promise<T> {
  const { label, service, method, url, json, form } = opts;
  const headers: Record<string, string> = { accept: "application/json", ...opts.headers };
  let body: string | undefined;
  if (form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(form).toString();
  } else if (json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(json);
  }

  const started = performance.now();
  let status = 0;
  let responseBody: unknown;
  try {
    const res = await fetch(url, { method, headers, body });
    status = res.status;
    responseBody = parse(await res.text());
  } catch (err) {
    responseBody = { error: String(err) };
    throw new ApiError(`${label} failed: ${String(err)}`, 0, responseBody, { cause: err });
  } finally {
    const request = redact(headers, form ?? json);
    record({
      ...(await currentRequest()),
      at: new Date().toISOString(),
      label,
      service,
      method,
      url,
      requestHeaders: request.headers,
      requestBody: request.body,
      status,
      responseBody: redact({}, responseBody).body,
      ms: Math.round(performance.now() - started),
    });
  }

  if (status < 200 || status >= 300) {
    const message = pactError(responseBody)?.message;
    const detail = typeof message === "string" ? `${message} (HTTP ${status})` : `HTTP ${status}`;
    throw new ApiError(`${label} failed: ${detail}`, status, responseBody);
  }
  if (!opts.schema) return responseBody as T;
  const parsed = opts.schema.safeParse(responseBody);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
  throw new ApiError(`${label}: response didn't match schema: ${issues}`, status, responseBody);
}

export function pactUrl(path: string): string {
  return config.pactBaseUrl.replace(/\/$/, "") + path;
}

/** Secret key: server only, used just for minting user tokens. */
export function serverAuth(): Record<string, string> {
  return { authorization: `Bearer ${config.pactSecretKey}` };
}

/** Publishable key + user token: acts only as that one user. */
export function userAuth(userToken: string): Record<string, string> {
  return {
    authorization: `Bearer ${config.pactPublishableKey}`,
    "x-pact-user-token": userToken,
  };
}
