import { config } from "../config.js";
import { AppError } from "../http.js";

/**
 * Outbound messaging adapters.
 *
 * These are real API calls, not simulated sends. Each provider requires
 * credentials in the environment (see docs/integrations.md). When a channel is
 * unconfigured the API refuses the send with a 409 and the UI tells the user
 * exactly which environment variables are missing — nothing is ever reported as
 * delivered that was not accepted by a provider.
 */

function notConfigured(channel, detail) {
  return new AppError(409, detail, "PROVIDER_NOT_CONFIGURED", { channel });
}

async function postJson(url, { headers = {}, body, method = "POST" } = {}) {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 500) }; }
  if (!res.ok) {
    const message = json?.error?.message || json?.message || json?.raw || `Provider returned HTTP ${res.status}`;
    throw new AppError(502, `Provider rejected the message: ${message}`, "PROVIDER_ERROR", { status: res.status });
  }
  return json;
}

export function channelConfigured(channel) {
  const p = config.providers;
  if (channel === "email") return Boolean(p.resend.key && p.resend.from);
  if (channel === "sms") return Boolean(p.twilio.sid && p.twilio.token && p.twilio.from);
  if (channel === "whatsapp") return Boolean(p.whatsapp.token && p.whatsapp.phoneId);
  return false;
}

export async function sendEmail({ to, subject, text }) {
  const p = config.providers.resend;
  if (!p.key || !p.from) {
    throw notConfigured("email", "Email sending is not configured. Set RESEND_API_KEY and RESEND_FROM in the server environment, then retry. The message can still be saved to the communication log.");
  }
  const result = await postJson("https://api.resend.com/emails", {
    headers: { authorization: `Bearer ${p.key}` },
    body: { from: p.from, to: [to], subject, text },
  });
  return { provider: "resend", ref: result?.id || "" };
}

export async function sendSms({ to, text }) {
  const p = config.providers.twilio;
  if (!p.sid || !p.token || !p.from) {
    throw notConfigured("sms", "SMS sending is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM in the server environment, then retry.");
  }
  const body = new URLSearchParams({ To: to, From: p.from, Body: text });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(p.sid)}/Messages.json`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${p.sid}:${p.token}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new AppError(502, `Twilio rejected the message: ${json?.message || `HTTP ${res.status}`}`, "PROVIDER_ERROR");
  }
  return { provider: "twilio", ref: json?.sid || "" };
}

export async function sendWhatsApp({ to, text }) {
  const p = config.providers.whatsapp;
  if (!p.token || !p.phoneId) {
    throw notConfigured("whatsapp", "WhatsApp sending is not configured. Set WHATSAPP_TOKEN and WHATSAPP_PHONE_ID (Meta WhatsApp Cloud API), then retry.");
  }
  const result = await postJson(`https://graph.facebook.com/v20.0/${encodeURIComponent(p.phoneId)}/messages`, {
    headers: { authorization: `Bearer ${p.token}` },
    body: {
      messaging_product: "whatsapp",
      to: to.replace(/[^\d]/g, ""),
      type: "text",
      text: { preview_url: false, body: text },
    },
  });
  return { provider: "whatsapp", ref: result?.messages?.[0]?.id || "" };
}

export async function sendMessage(channel, payload) {
  if (channel === "email") return sendEmail(payload);
  if (channel === "sms") return sendSms(payload);
  if (channel === "whatsapp") return sendWhatsApp(payload);
  throw new AppError(400, "Unsupported channel.", "VALIDATION");
}
