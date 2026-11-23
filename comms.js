import { all, logActivity, nowIso, one, run } from "../db.js";
import { canSeeAllLeads } from "../auth.js";
import { AppError, bad, conflict, notFound } from "../http.js";
import * as v from "../services/validate.js";
import { channelConfigured, sendMessage } from "../services/mailer.js";
import { config, providerStatus } from "../config.js";
import { resolveEventsForLead } from "../services/engine.js";
import { serializeLead } from "./leads.js";

const CHANNELS = ["email", "whatsapp", "sms"];

function renderTemplate(text, lead, user) {
  return String(text || "")
    .replaceAll("{name}", lead.name || "")
    .replaceAll("{first_name}", (lead.name || "").split(" ")[0] || "")
    .replaceAll("{company}", lead.company || "your company")
    .replaceAll("{deal_value}", String(lead.deal_value ?? ""))
    .replaceAll("{employee}", user?.name || "")
    .replaceAll("{business}", user?.org?.name || "");
}

export const commsRoutes = [
  {
    method: "GET", path: "/api/comms", capability: "comms:send",
    handler({ user, query }) {
      const where = ["m.org_id = ?"];
      const params = [user.orgId];
      if (query.lead_id) { where.push("m.lead_id = ?"); params.push(Number(query.lead_id)); }
      if (query.channel) { where.push("m.channel = ?"); params.push(String(query.channel)); }
      if (!canSeeAllLeads(user)) {
        where.push("(l.assigned_to = ? OR m.user_id = ?)");
        params.push(user.id, user.id);
      }
      const messages = all(
        `SELECT m.*, l.name AS lead_name, u.name AS user_name FROM messages m
           LEFT JOIN leads l ON l.id = m.lead_id LEFT JOIN users u ON u.id = m.user_id
          WHERE ${where.join(" AND ")} ORDER BY m.created_at DESC LIMIT 300`,
        ...params,
      );
      return {
        messages,
        providers: providerStatus(),
        templates: all("SELECT * FROM templates WHERE org_id = ? ORDER BY channel, name", user.orgId),
      };
    },
  },
  {
    method: "POST", path: "/api/comms/send", capability: "comms:send",
    async handler({ user, body }) {
      const lead = one("SELECT * FROM leads WHERE id = ? AND org_id = ?", Number(body.lead_id), user.orgId);
      if (!lead) throw notFound("Lead not found.");
      if (!canSeeAllLeads(user) && lead.assigned_to !== user.id) throw bad("This lead is not assigned to you.");
      const channel = v.pickEnum(body.channel, CHANNELS, "Channel");
      const template = body.template_id ? one("SELECT * FROM templates WHERE id = ? AND org_id = ?", Number(body.template_id), user.orgId) : null;
      const subject = renderTemplate(v.str(body.subject ?? template?.subject ?? "", "Subject", { max: 200 }), lead, user);
      const text = renderTemplate(v.str(body.body ?? template?.body ?? "", "Message", { required: true, max: 8000 }), lead, user);
      const to = channel === "email" ? lead.email : lead.phone;
      if (!to) throw bad(`This lead has no ${channel === "email" ? "email address" : "phone number"} on file.`);
      if (lead.opted_out || lead.consent === "revoked") {
        throw new AppError(409, "This customer has withdrawn consent or opted out. Messaging is blocked until consent is recorded again.", "CONSENT_BLOCKED");
      }
      if (lead.consent === "unknown" && channel !== "email") {
        throw new AppError(409, "Consent has not been recorded for this customer. Record consent in the lead's communication panel before sending WhatsApp or SMS.", "CONSENT_REQUIRED");
      }
      const logOnly = Boolean(body.log_only);
      const now = nowIso();
      const messageId = Number(run(
        `INSERT INTO messages (org_id, lead_id, user_id, channel, direction, to_address, subject, body, status, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        user.orgId, lead.id, user.id, channel, "outbound", to, subject, text, logOnly ? "logged" : "queued", now,
      ).lastInsertRowid);

      if (logOnly) {
        run(
          `INSERT INTO interactions (org_id, lead_id, user_id, type, channel, direction, summary, outcome, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          user.orgId, lead.id, user.id, channel, channel, "outbound", `Manual ${channel} contact logged: ${text.slice(0, 400)}`, "none", now,
        );
        run("UPDATE leads SET last_contact_at = ?, updated_at = ? WHERE id = ?", now, now, lead.id);
        resolveEventsForLead(user.orgId, lead.id, "contact_logged", { actor: user });
        logActivity(user.orgId, user, "comms.logged", "lead", lead.id, `${channel} contact logged manually`);
        return { message: one("SELECT * FROM messages WHERE id = ?", messageId), sent: false, logged: true };
      }

      if (!channelConfigured(channel)) {
        run("UPDATE messages SET status = 'failed', error = ? WHERE id = ?",
          "Provider not configured on this server. The message was not sent.", messageId);
        throw new AppError(409,
          providerStatus().detail[channel],
          "PROVIDER_NOT_CONFIGURED", { channel, message_id: messageId });
      }

      try {
        const result = await sendMessage(channel, { to, subject, text });
        run("UPDATE messages SET status='sent', provider=?, provider_ref=?, sent_at=? WHERE id=?",
          result.provider, result.ref, nowIso(), messageId);
        run(
          `INSERT INTO interactions (org_id, lead_id, user_id, type, channel, direction, summary, outcome, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          user.orgId, lead.id, user.id, channel, channel, "outbound",
          `Sent via ${result.provider}: ${text.slice(0, 400)}`, "none", nowIso(),
        );
        run("UPDATE leads SET last_contact_at = ?, updated_at = ? WHERE id = ?", nowIso(), nowIso(), lead.id);
        resolveEventsForLead(user.orgId, lead.id, "contact_logged", { actor: user });
        logActivity(user.orgId, user, "comms.sent", "lead", lead.id, `${channel} via ${result.provider}`);
        return { message: one("SELECT * FROM messages WHERE id = ?", messageId), sent: true };
      } catch (err) {
        run("UPDATE messages SET status='failed', error=? WHERE id=?", String(err.message).slice(0, 400), messageId);
        throw err;
      }
    },
  },
  {
    method: "GET", path: "/api/comms/providers", capability: "comms:send",
    handler() { return { providers: providerStatus() }; },
  },
  {
    method: "POST", path: "/api/comms/templates", capability: "comms:send",
    handler({ user, body }) {
      const name = v.str(body.name, "Template name", { required: true, max: 100 });
      const channel = v.pickEnum(body.channel, CHANNELS, "Channel", "email");
      const subject = v.str(body.subject, "Subject", { max: 200 });
      const bodyText = v.str(body.body, "Message body", { required: true, max: 8000 });
      const res = run(
        "INSERT INTO templates (org_id, name, channel, subject, body, created_at) VALUES (?,?,?,?,?,?)",
        user.orgId, name, channel, subject, bodyText, nowIso(),
      );
      return { template: one("SELECT * FROM templates WHERE id = ?", Number(res.lastInsertRowid)) };
    },
  },
  {
    method: "PATCH", path: "/api/comms/templates/:id", capability: "comms:send",
    handler({ user, params, body }) {
      const tpl = one("SELECT * FROM templates WHERE id = ? AND org_id = ?", Number(params.id), user.orgId);
      if (!tpl) throw notFound("Template not found.");
      run(
        "UPDATE templates SET name=?, channel=?, subject=?, body=? WHERE id=?",
        v.str(body.name ?? tpl.name, "Template name", { required: true, max: 100 }),
        v.pickEnum(body.channel ?? tpl.channel, CHANNELS, "Channel", tpl.channel),
        v.str(body.subject ?? tpl.subject, "Subject", { max: 200 }),
        v.str(body.body ?? tpl.body, "Message body", { required: true, max: 8000 }),
        tpl.id,
      );
      return { template: one("SELECT * FROM templates WHERE id = ?", tpl.id) };
    },
  },
  {
    method: "DELETE", path: "/api/comms/templates/:id", capability: "comms:send",
    handler({ user, params }) {
      const tpl = one("SELECT * FROM templates WHERE id = ? AND org_id = ?", Number(params.id), user.orgId);
      if (!tpl) throw notFound("Template not found.");
      run("DELETE FROM templates WHERE id = ?", tpl.id);
      return { ok: true };
    },
  },
];
