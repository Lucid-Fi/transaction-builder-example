import "server-only";

// Env is read on access, so `next build` works without secrets and tests can `vi.stubEnv`.
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

function list(name: string): string[] {
  return (process.env[name] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export const config = {
  get pactBaseUrl() {
    return process.env.PACT_API_BASE_URL || "https://sandbox.api.pactlabs.com";
  },
  get pactSecretKey() {
    return required("PACT_SECRET_KEY");
  },
  get pactPublishableKey() {
    return required("PACT_PUBLISHABLE_KEY");
  },
  /** Without a Twilio API key, sign-in skips the SMS code (demo only). */
  get twilioEnabled() {
    return Boolean(process.env.TWILIO_API_KEY_SID);
  },
  get twilioServiceSid() {
    return required("TWILIO_VERIFY_SERVICE_SID");
  },
  get twilioApiKeySid() {
    return required("TWILIO_API_KEY_SID");
  },
  get twilioApiKeySecret() {
    return required("TWILIO_API_KEY_SECRET");
  },
  get sessionSecret() {
    return required("SESSION_SECRET");
  },
  get webauthnRpId() {
    return process.env.WEBAUTHN_RP_ID || "localhost";
  },
  /** Other web origins served in /.well-known/webauthn (related origin requests). */
  get webauthnRelatedOrigins() {
    return list("WEBAUTHN_RELATED_ORIGINS");
  },
  /** iOS app IDs (TEAMID.bundle.id) served in /.well-known/apple-app-site-association. */
  get appleAppIds() {
    return list("APPLE_APP_IDS");
  },
  /** Android app served in /.well-known/assetlinks.json, with its signing cert fingerprints. */
  get androidPackageName() {
    return process.env.ANDROID_PACKAGE_NAME?.trim() ?? "";
  },
  get androidCertFingerprints() {
    return list("ANDROID_SHA256_CERT_FINGERPRINTS");
  },
};

export const secureCookies = process.env.NODE_ENV === "production";
