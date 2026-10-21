import { afterEach, expect, it, vi } from "vitest";
import { call } from "./http";
import { listCalls } from "./recorder";

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ "x-request-id": "req-1", "x-pathname": "/wallet", "x-inspector-id": "browser-a" }),
}));

afterEach(() => vi.unstubAllGlobals());

it("stamps recorded calls with the request and browser from src/proxy.ts", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
  await call({ label: "t", service: "test", method: "GET", url: "https://pact.test/x" });
  expect(listCalls("browser-a")[0]).toMatchObject({
    requestId: "req-1",
    path: "/wallet",
    inspectorId: "browser-a",
  });
  expect(listCalls("browser-b")).toEqual([]);
});
