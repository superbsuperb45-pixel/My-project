import { all, getSettings, logActivity, nowIso, one, run } from "../db.js";
import { canSeeAllLeads, requireCapability } from "../auth.js";
import { bad, conflict, notFound } from "../http.js";
import * as v from "../services/validate.js";
import { evaluateRecovery, recoverySummary, resolveEventsForLead } from "../services/engine.js";
import { attachScores, serializeLead } from "./leads.js";

export const recoveryRoutes = [
  {
    method: "GET", path: "/api/recovery", capability: "recovery:read",
    handler({ user, query, org, settings }) {
      // Rules are evaluated on read so the queue is always current, even if the background tick is off.
      evaluateRecovery(org, settings, { actor: user });
      const status = query.status === "history" ? "resolved" : "open";
      const scopeSql = canSeeAllLeads(user) ? "" : " AND l.assigned_to = ?";
      const scopeParams = canSeeAllLeads(user) ? [] : [user.id];
      const rows = all(
        `SELECT e.*, l.name AS lead_name, l.status AS lead_status, l.deal_value, l.phone, l.email, l.company,
                l.last_contact_at, l.received_at, l.follow_up_at, l.assigned_to, u.name AS assignee_name
           FROM recovery_events e JOIN leads l ON l.id = e.lead_id LEFT JOIN users u ON u.id = l.assigned_to
          WHERE e.org_id = ? AND e.status = ?${scopeSql}
          ORDER BY e.severity DESC, e.detected_at DESC LIMIT 400`,
        user.orgId, status, ...scopeParams,
      );
      const leadIds = [...new Set(rows.map((r) => r.lead_id))];
      const leads = leadIds.length
        ? all(`SELECT * FROM leads WHERE org_id = ? AND id IN (${leadIds.map(() => "?").join(",")})`, user.orgId, ...leadIds)
        : [];
      const scored = new Map(attachScores(leads, user.orgId, settings).map((l) => [l.id, l.score]));

      const grouped = new Map();
      for (const r of rows) {
        const entry = grouped.get(r.lead_id) || {
          lead_id: r.lead_id,
          lead: serializeLead(leads.find((l) => l.id === r.lead_id)),
          score: scored.get(r.lead_id),
          assignee_name: r.assignee_name,
          flags: [],
        };
        entry.flags.push({ id: r.id, key: r.rule_key, label: r.rule_label, recommendation: r.recommendation, severity: r.severity, status: r.status, detected_at: r.detected_at, resolved_at: r.resolved_at, resolution: r.resolution });
        grouped.set(r.lead_id, entry);
      }
      const queue = [...grouped.values()].map((e) => ({ ...e, top_severity: Math.max(...e.flags.map((f) => f.severity)) }))
        .sort((a, b) => b.top_severity - a.top_severity || (b.score?.score || 0) - (a.score?.score || 0));

      const lost = all(
        `SELECT l.*, u.name AS assignee_name FROM leads l LEFT JOIN users u ON u.id = l.assigned_to
          WHERE l.org_id = ? AND l.status = 'lost'${canSeeAllLeads(user) ? "" : " AND l.assigned_to = ?"}
          ORDER BY l.lost_at DESC, l.updated_at DESC LIMIT 200`,
        user.orgId, ...scopeParams,
      );
      const history = all(
        `SELECT e.*, l.name AS lead_name FROM recovery_events e JOIN leads l ON l.id = e.lead_id
          WHERE e.org_id = ? AND e.status = 'resolved'${canSeeAllLeads(user) ? "" : " AND l.assigned_to = ?"}
          ORDER BY e.resolved_at DESC LIMIT 200`,
        user.orgId, ...scopeParams,
      );
      return {
        queue,
        summary: recoverySummary(user.orgId, settings),
        rules: settings.recovery,
        lost_opportunities: lost.map((l) => ({ ...serializeLead(l), assignee_name: l.assignee_name })),
        history,
        counts: {
          flagged_leads: queue.length,
          open_flags: rows.length,
          lost: lost.length,
          recovered: all("SELECT COUNT(*) AS n FROM leads WHERE org_id = ? AND recovered_at IS NOT NULL", user.orgId)[0].n,
        },
      };
    },
  },
  {
    method: "POST", path: "/api/recovery/run", capability: "recovery:manage",
    handler({ user, org, settings }) {
      const result = evaluateRecovery(org, settings, { actor: user });
      return { ...result, summary: recoverySummary(user.orgId, settings) };
    },
  },
  {
    method: "POST", path: "/api/recovery/:id/resolve", capability: "recovery:manage",
    handler({ user, params, body }) {
      const event = one("SELECT * FROM recovery_events WHERE id = ? AND org_id = ?", Number(params.id), user.orgId);
      if (!event) throw notFound("Recovery flag not found.");
      if (event.status !== "open") throw conflict("This flag is already resolved.", "ALREADY_RESOLVED");
      const resolution = v.pickEnum(body.resolution, ["dismissed", "contact_logged", "rescheduled", "recovered"], "Resolution", "dismissed");
      run(
        "UPDATE recovery_events SET status='resolved', resolution=?, resolved_at=?, resolved_by=? WHERE id=?",
        resolution, nowIso(), user.id, event.id,
      );
      logActivity(user.orgId, user, "recovery.resolved", "recovery", event.id, `${event.rule_key}: ${resolution}`);
      return { ok: true };
    },
  },
  {
    method: "POST", path: "/api/recovery/resolve-lead/:leadId", capability: "recovery:manage",
    handler({ user, params, body }) {
      const lead = one("SELECT * FROM leads WHERE id = ? AND org_id = ?", Number(params.leadId), user.orgId);
      if (!lead) throw notFound("Lead not found.");
      if (!canSeeAllLeads(user) && lead.assigned_to !== user.id) throw bad("This lead is not assigned to you.");
      const resolution = v.pickEnum(body.resolution, Object.keys({ dismissed: 1, contact_logged: 1, rescheduled: 1, recovered: 1 }), "Resolution", "dismissed");
      resolveEventsForLead(user.orgId, lead.id, resolution, { actor: user });
      return { ok: true };
    },
  },
];
