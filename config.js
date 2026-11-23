import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..");

function bool(value, fallback = false) {
  if (value == null) return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

export const config = {
  root: ROOT,
  publicDir: path.join(ROOT, "public"),
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || "0.0.0.0",
  dbPath: process.env.DATABASE_PATH || path.join(ROOT, "data", "leadrescue.db"),
  appUrl: (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  sessionCookie: "lr_session",
  sessionDays: Number(process.env.SESSION_DAYS || 14),
  secureCookies: bool(process.env.SECURE_COOKIES, (process.env.APP_URL || "").startsWith("https")),
  trustProxy: bool(process.env.TRUST_PROXY, true),
  // Recovery engine tick (ms). 0 disables the background tick (rules still run on demand).
  engineIntervalMs: Number(process.env.ENGINE_INTERVAL_MS || 60000),
  // Google Search Console verification token. Rendered into <head> of every public page
  // and into the HTML-file verification endpoint.
  googleSiteVerification: process.env.GOOGLE_SITE_VERIFICATION || "",
  googleAnalyticsId: process.env.GOOGLE_ANALYTICS_ID || "",
  // Outbound providers. Empty values mean "not configured" and the UI says so.
  providers: {
    resend: {
      key: process.env.RESEND_API_KEY || "",
      from: process.env.RESEND_FROM || "",
    },
    twilio: {
      sid: process.env.TWILIO_ACCOUNT_SID || "",
      token: process.env.TWILIO_AUTH_TOKEN || "",
      from: process.env.TWILIO_FROM || "",
    },
    whatsapp: {
      token: process.env.WHATSAPP_TOKEN || "",
      phoneId: process.env.WHATSAPP_PHONE_ID || "",
    },
  },
};

export function providerStatus() {
  const p = config.providers;
  return {
    email: Boolean(p.resend.key && p.resend.from),
    sms: Boolean(p.twilio.sid && p.twilio.token && p.twilio.from),
    whatsapp: Boolean(p.whatsapp.token && p.whatsapp.phoneId),
    detail: {
      email: p.resend.key && p.resend.from
        ? "Resend API credentials detected in environment."
        : "Email sending requires RESEND_API_KEY and RESEND_FROM. Until configured, messages are recorded as drafts in the communication log.",
      sms: p.twilio.sid && p.twilio.from
        ? "Twilio credentials detected in environment."
        : "SMS sending requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM. Until configured, messages are recorded as drafts.",
      whatsapp: p.whatsapp.token
        ? "WhatsApp Cloud API credentials detected in environment."
        : "WhatsApp sending requires WHATSAPP_TOKEN and WHATSAPP_PHONE_ID (Meta WhatsApp Cloud API). Until configured, messages are recorded as drafts.",
    },
  };
}
