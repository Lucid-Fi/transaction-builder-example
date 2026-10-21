import "server-only";
import { config } from "./config";
import { call } from "./http";

const verifyUrl = (resource: string) =>
  `https://verify.twilio.com/v2/Services/${config.twilioServiceSid}/${resource}`;

function basicAuth(): Record<string, string> {
  const credentials = `${config.twilioApiKeySid}:${config.twilioApiKeySecret}`;
  return { authorization: `Basic ${Buffer.from(credentials).toString("base64")}` };
}

export async function startVerification(phone: string): Promise<void> {
  // Twilio Verify: POST /v2/Services/{sid}/Verifications
  await call({
    label: "Send SMS code (Twilio Verify)",
    service: "twilio",
    method: "POST",
    url: verifyUrl("Verifications"),
    headers: basicAuth(),
    form: { To: phone, Channel: "sms" },
  });
}

export async function checkVerification(phone: string, code: string): Promise<boolean> {
  // Twilio Verify: POST /v2/Services/{sid}/VerificationCheck
  const result = await call<{ status: string }>({
    label: "Check SMS code (Twilio Verify)",
    service: "twilio",
    method: "POST",
    url: verifyUrl("VerificationCheck"),
    headers: basicAuth(),
    form: { To: phone, Code: code },
  });
  return result.status === "approved";
}
