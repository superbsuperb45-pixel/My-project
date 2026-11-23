import { all, getSettings, logActivity, nowIso, one, run, tx } from "../db.js";
import { canSeeAllLeads, can, requireCapability, assertLeadAccess } from "../auth.js";
import { bad, conflict, forbidden, notFound } from "../http.js";
import * as v from "../services/validate.js";
import { serializeLead, attachScores } from "./leads.js";

function scopedFollowup(user, id) {
  const row = one(
    `SELECT f.*, l.name AS lead_name, l.org_id, l.assigned_to AS lead_owner, u.name AS assignee_name
       FROM followups f JOIN leads l ON l.id = f.lead_id LEFT JOIN users u ON u.id = f.assigned_to
      WHERE f.id = ?`,
    Number(id),
  );
  if (!row || row.org_id !== user.orgId) throw notFound("Follow-up not found.");
  if (!canSeeAllLeads(user) && row.assigned_to !== user.id && row.lead_owner !== user.id) {
    throw forbidden("This follow-up is not assigned to you.");
  }
  return row;
}

export const followupRoutes = [
  {
    method: "GET", path: "/api/followups", capability: "followup:read_own",
    handler({ user, query }) {
      const where = ["f.org_id = ?"];
      const params = [user.orgId];
      if (!canSeeAllLeads(user)) {
        where.push("(f.assigned_to = ? OR l.assigned_to = ?)");
        params.push(user.id, user.id);
      } else if (query.assigned) {
        where.push("f.assigned_to = ?");
        params.push(Number(query.assigned));
      }
      if (query.status) { where.push("f.status = ?"); params.push(String(query.status)); }
      if (query.lead_id) { where.push("f.lead_id = ?"); params.push(Number(query.lead_id)); }
      if (query.from) { where.push("f.due_at >= ?"); params.push(new Date(query.from).toISOString()); }
      if (query.to) { where.push("f.due_at <= ?"); params.push(new Date(query.to).toISOString()); }
      if (query.due === "overdue") { where.push("f.status = 'pending' AND f.due_at < ?"); params.push(nowIso()); }
      if (query.due === "today") {
        const start = new Date(); start.setHours(0, 0, 0, 0);
        const end = new Date(); end.setHours(23, 59, 59, 999);
        where.push("f.status = 'pending' AND f.due_at >= ? AND f.due_at <= ?");
        params.push(start.toISOString(), end.toISOString());
      }
      const rows = all(
        `SELECT f.*, l.name AS lead_name, l.phone AS lead_phone, l.email AS lead_email, l.status AS lead_status,
                l.deal_value AS lead_value, u.name AS assignee_name
           FROM followups f JOIN leads l ON l.id = f.lead_id LEFT JOIN users u ON u.id = f.assigned_to
          WHERE ${where.join(" AND ")} ORDER BY f.due_at ASC LIMIT 1000`,
        ...params,
      );
      const now = Date.now();
      return {
        followups: rows.map((r) => ({
          ...r,
          is_overdue: r.status === "pending" && new Date(r.due_at).getTime() < now,
        })),
        counts: {
          pending: rows.filter((r) => r.status === "pending").length,
          overdue: rows.filter((r) => r.status === "pending" && new Date(r.due_at).getTime() < now).length,
          completed: rows.filter((r) => r.status === "completed").length,
        },
      };
    },
  },
  {
    method: "PATCH", path: "/api/followups/:id", capability: "followup:write_own",
    handler({ user, params, body }) {
      const row = scopedFollowup(user, params.id);
      const due = body.due_at === undefined ? row.due_at : v.isoDate(body.due_at, "Follow-up date", { required: true });
      const channel = body.channel === undefined ? row.channel : v.pickEnum(body.channel, ["call", "email", "whatsapp", "sms", "meeting"], "Channel");
      const note = body.note === undefined ? row.note : v.str(body.note, "Note", { max: 1000 });
      let assigned = row.assigned_to;
      if (body.assigned_to !== undefined) {
        assigned = body.assigned_to ? Number(body.assigned_to) : null;
        if (!canSeeAllLeads(user) && assigned !== user.id) throw forbidden("You can only assign follow-ups to yourself.");
        if (assigned && !one("SELECT id FROM users WHERE id = ? AND org_id = ?", assigned, user.orgId)) throw bad("Assigned team member not found.");
      }
      const status = body.status ? v.pickEnum(body.status, ["pending", "completed", "cancelled"], "Status") : row.status;
      run(
        "UPDATE followups SET due_at = ?, channel = ?, note = ?, assigned_to = ?, status = ? WHERE id = ? AND org_id = ?",
        due, channel, note, assigned, status, row.id, user.orgId,
      );
      if (row.status === "pending") {
        run("UPDATE leads SET follow_up_at = ?, updated_at = ? WHERE id = ?", due, nowIso(), row.lead_id);
      }
      logActivity(user.orgId, user, "followup.updated", "followup", row.id, `Due ${due.slice(0, 10)}`);
      return { followup: one("SELECT * FROM followups WHERE id = ?", row.id) };
    },
  },
  {
    method: "POST", path: "/api/followups/:id/complete", capability: "followup:write_own",
    handler({ user, params, body }) {
      const row = scopedFollowup(user, params.id);
      if (row.status !== "pending") throw conflict("This follow-up is already closed.", "ALREADY_CLOSED");
      const outcome = v.pickEnum(body.outcome, ["response", "new_opportunity", "conversion", "no_response", "none"], "Outcome", "none");
      const note = v.str(body.note, "Outcome note", { max: 2000 });
      const now = nowIso();
      const nextDays = body.next_followup_days === undefined || body.next_followup_days === null || body.next_followup_days === ""
        ? null : (v.range(body.next_followup_days, { min: 1, max: 365, fallback: 0 }) || null);
      const lead = one("SELECT * FROM leads WHERE id = ?", row.lead_id);

      tx(() => {
        run(
          "UPDATE followups SET status = 'completed', completed_at = ?, outcome = ?, note = CASE WHEN ? = '' THEN note ELSE ? END WHERE id = ?",
          now, outcome, note, note, row.id,
        );
        run(
          `INSERT INTO interactions (org_id, lead_id, user_id, type, channel, direction, summary, outcome, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          user.orgId, row.lead_id, user.id, row.channel, row.channel, "outbound",
          note || `Follow-up completed (${row.channel}).`, outcome, now,
        );
        const isResponse = ["response", "new_opportunity", "conversion"].includes(outcome);
        let newStatus = lead.status;
        if (outcome === "conversion") newStatus = "converted";
        else if (outcome === "new_opportunity") newStatus = "interested";
        else if (outcome === "response" && ["new", "overdue"].includes(lead.status)) newStatus = "contacted";
        else if (outcome === "no_response" && lead.status === "new") newStatus = "contacted";
        run(
          `UPDATE leads SET last_contact_at = ?, first_response_at = COALESCE(first_response_at, ?),
              status = ?, converted_at = CASE WHEN ? = 'converted' THEN COALESCE(converted_at, ?) ELSE converted_at END,
              updated_at = ?
            WHERE id = ? AND org_id = ?`,
          now, isResponse ? now : null, newStatus, newStatus, now, now, lead.id, user.orgId,
        );
        if (nextDays) {
          const due = new Date(Date.now() + nextDays * 86400_000).toISOString();
          run(
            `INSERT INTO followups (org_id, lead_id, assigned_to, due_at, channel, note, status, created_by, created_at)
             VALUES (?,?,?,?,?,?,'pending',?,?)`,
            user.orgId, lead.id, row.assigned_to, due, row.channel, "Scheduled from previous follow-up.", user.id, now,
          );
          run("UPDATE leads SET follow_up_at = ? WHERE id = ?", due, lead.id);
        } else {
          run("UPDATE leads SET follow_up_at = NULL WHERE id = ?", lead.id);
        }
      });
      logActivity(user.orgId, user, "followup.completed", "followup", row.id, outcome);
      return { followup: one("SELECT * FROM followups WHERE id = ?", row.id), lead: serializeLead(one("SELECT * FROM leads WHERE id = ?", row.lead_id)) };
    },
  },
  {
    method: "DELETE", path: "/api/followups/:id", capability: "followup:write_all",
    handler({ user, params }) {
      const row = scopedFollowup(user, params.id);
      run("DELETE FROM followups WHERE id = ? AND org_id = ?", row.id, user.orgId);
      logActivity(user.orgId, user, "followup.deleted", "followup", row.id, row.lead_name || "");
      return { ok: true };
    },
  },
];
