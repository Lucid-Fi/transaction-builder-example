import { describe, expect, it, vi } from "vitest";
import { GET as aasa } from "./.well-known/apple-app-site-association/route";
import { GET as assetlinks } from "./.well-known/assetlinks.json/route";
import { GET as webauthn } from "./.well-known/webauthn/route";

vi.mock("next/server", () => ({ connection: async () => {} }));

async function json(res: Response) {
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toMatch(/^application\/json/);
  return res.json();
}

describe("/.well-known routes", () => {
  it("webauthn", async () => {
    vi.stubEnv("WEBAUTHN_RELATED_ORIGINS", " , ");
    expect((await webauthn()).status).toBe(404);
    vi.stubEnv("WEBAUTHN_RELATED_ORIGINS", " https://app.payactiv.com, ,https://payactiv.com ");
    expect(await json(await webauthn())).toEqual({ origins: ["https://app.payactiv.com", "https://payactiv.com"] });
  });

  it("apple-app-site-association", async () => {
    vi.stubEnv("APPLE_APP_IDS", "");
    expect((await aasa()).status).toBe(404);
    vi.stubEnv("APPLE_APP_IDS", "ABCDE12345.com.payactiv.app, ,ABCDE12345.com.payactiv.other");
    expect(await json(await aasa())).toEqual({
      webcredentials: { apps: ["ABCDE12345.com.payactiv.app", "ABCDE12345.com.payactiv.other"] },
    });
  });

  it("assetlinks.json needs both package name and fingerprints", async () => {
    vi.stubEnv("ANDROID_PACKAGE_NAME", "com.payactiv.app");
    vi.stubEnv("ANDROID_SHA256_CERT_FINGERPRINTS", "");
    expect((await assetlinks()).status).toBe(404);
    vi.stubEnv("ANDROID_PACKAGE_NAME", " ");
    vi.stubEnv("ANDROID_SHA256_CERT_FINGERPRINTS", "AA:BB");
    expect((await assetlinks()).status).toBe(404);
    vi.stubEnv("ANDROID_PACKAGE_NAME", " com.payactiv.app ");
    vi.stubEnv("ANDROID_SHA256_CERT_FINGERPRINTS", " AA:BB , ,CC:DD");
    expect(await json(await assetlinks())).toEqual([
      {
        relation: ["delegate_permission/common.get_login_creds"],
        target: { namespace: "android_app", package_name: "com.payactiv.app", sha256_cert_fingerprints: ["AA:BB", "CC:DD"] },
      },
    ]);
  });
});
