import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, call } from "./http";
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

describe("call() response schema", () => {
  const schema = z.object({ positions: z.array(z.object({ apy: z.object({ total: z.string() }) })) });
  const reply = (body: unknown) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
    return call({ label: "t", service: "test", method: "GET", url: "https://pact.test/x", schema });
  };

  it("rejects a wrong type with the 2xx status, and still records the body", async () => {
    const body = { positions: [{ apy: { total: null } }] };
    const err = await reply(body).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 200,
      message: "t: response didn't match schema: positions.0.apy.total: Invalid input: expected string, received null",
    });
    expect(listCalls("browser-a")[0]).toMatchObject({ status: 200, responseBody: body });
  });

  it("rejects a missing field", async () => {
    await expect(reply({ positions: [{ apy: {} }] })).rejects.toThrow(
      "positions.0.apy.total: Invalid input: expected string, received undefined",
    );
  });

  it("strips an unknown field", async () => {
    await expect(reply({ positions: [], added: 1 })).resolves.toEqual({ positions: [] });
  });

  it("names a non-object body (root)", async () => {
    await expect(reply("oops")).rejects.toThrow("(root): ");
  });

  it("joins every issue with '; '", async () => {
    await expect(reply({ positions: [{ apy: {} }, { apy: { total: 1 } }] })).rejects.toThrow(
      "positions.0.apy.total: Invalid input: expected string, received undefined; positions.1.apy.total: ",
    );
  });
});
