import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

// Forwarded request headers surface as x-middleware-request-<name> (next/dist/server/web/spec-extension/response.js).
const forwarded = (res: Response, name: string) => res.headers.get(`x-middleware-request-${name}`);

describe("proxy", () => {
  it("mints an httpOnly inspector cookie and ignores a client-sent inspector id", () => {
    const res = proxy(new NextRequest("https://demo.test/wallet", { headers: { "x-inspector-id": "victim" } }));
    const id = res.cookies.get("inspector_id")?.value;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const cookie = res.headers.get("set-cookie");
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(forwarded(res, "x-inspector-id")).toBe(id);
    expect(forwarded(res, "x-request-id")).toBeTruthy();
  });

  it("reuses the browser's existing inspector id", () => {
    const res = proxy(new NextRequest("https://demo.test/wallet", { headers: { cookie: "inspector_id=abc" } }));
    expect(forwarded(res, "x-inspector-id")).toBe("abc");
    expect(res.cookies.get("inspector_id")).toBeUndefined();
  });
});
