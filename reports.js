import { all, one, run } from "../db.js";
import { canSeeAllLeads } from "../auth.js";
import { bad, conflict, notFound } from "../http.js";
import * as v from "../services/validate.js";
import { dashboard, parseRange, reports } from "../services/analytics.js";
import { toCsv } from "../services/csv.js";
import { nowIso } from "../db.js";
import { createHash, randomBytes } from "node:crypto";
import { hashPassword, passwordIssue, normalizeEmail, currentUser } from "../auth.js";
import { config } from "../config.js";

export const reportRoutes = [
  {
    method: "GET", path: "/api/dashboard", capability: "reports:read_own",
    handler({ user, query, settings }) {
      const range = parseRange(query, { days: 30 });
      return dashboard(user, range, settings, { granularity: query.granularity });
    },
  },
  {
    method: "GET", path: "/api/reports", capability: "reports:read_own",
    handler({ user, query, settings }) {
      const range = parseRange(query, { days: 90 });
      return reports(user, range, settings);
    },
  },
  {
    method: "GET", path: "/api/reports/export.csv", capability: "export:csv", raw: true,
    handler({ user, query, res, settings }) {
      const range = parseRange(query, { days: 90 });
      const data = reports(user, range, settings);
      const type = String(query.type || "summary");
      let csv;
      if (type === "employees") {
        csv = toCsv(
          ["employee", "role", "leads", "contacted", "converted", "conversion_rate_percent", "revenue",
            "recovered", "followups_due", "followups_completed", "on_time_rate_percent", "avg_response_hours", "interactions"],
          data.employees.map((e) => ({
            employee: e.name, role: e.role, leads: e.leads, contacted: e.contacted, converted: e.converted,
            conversion_rate_percent: e.conversion_rate, revenue: e.revenue.toFixed(2), recovered: e.recovered,
            followups_due: e.followups_due, followups_completed: e.followups_completed,
            on_time_rate_percent: e.on_time_rate ?? "", avg_response_hours: e.avg_response_hours ?? "", interactions: e.interactions,
          })),
        );
      } else if (type === "sources") {
        csv = toCsv(
          ["source", "leads", "contacted", "converted", "lost", "recovered", "revenue", "conversion_rate_percent", "avg_response_hours"],
          data.sources.map((s) => ({
            source: s.source, leads: s.leads, contacted: s.contacted, converted: s.converted, lost: s.lost,
            recovered: s.recovered, revenue: s.revenue.toFixed(2), conversion_rate_percent: s.conversion_rate,
            avg_response_hours: s.avg_response_hours ?? "",
          })),
        );
      } else {
        const m = data.metrics;
        csv = toCsv(["metric", "value"], [
          { metric: "Range from", value: data.range.from.slice(0, 10) },
          { metric: "Range to", value: data.range.to.slice(0, 10) },
          { metric: "Total leads received", value: m.total_leads },
          { metric: "New leads", value: m.new_leads },
          { metric: "Unanswered leads", value: m.unanswered_leads },
          { metric: "Neglected leads (flagged)", value: m.neglected_leads },
          { metric: "Recovered leads", value: m.recovered_leads },
          { metric: "Recovered leads in range", value: m.recovered_leads_in_range },
          { metric: "Converted customers", value: m.converted_customers },
          { metric: "Lost opportunities", value: m.lost_leads },
          { metric: "Lead conversion rate (%)", value: m.conversion_rate },
          { metric: "Recovered revenue", value: m.recovered_revenue_in_range.toFixed(2) },
          { metric: "Converted revenue", value: m.converted_revenue.toFixed(2) },
          { metric: "Avg response time (hours)", value: m.avg_response_hours ?? "" },
          { metric: "Avg time to conversion (days)", value: m.avg_conversion_days_all ?? "" },
        ]);
      }
      res.writeHead(200, {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="leadrescue-report-${type}-${nowIso().slice(0, 10)}.csv"`,
        "cache-control": "no-store",
      });
      res.end(csv);
      return null;
    },
  },
];

export const teamRoutes = [
  {
    method: "GET", path: "/api/team", capability: "team:read",
    handler({ user, settings }) {
      const members = all(
        `SELECT id, name, email, role, status, created_at, last_login_at FROM users WHERE org_id = ? ORDER BY created_at`,
        user.orgId,
      );
      const stats = all(
        `SELECT assigned_to, COUNT(*) AS leads,
                SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) AS converted,
                SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) AS lost
           FROM leads WHERE org_id = ? GROUP BY assigned_to`, user.orgId,
      );
      const statMap = new Map(stats.map((s) => [s.assigned_to, s]));
      const pending = all(
        `SELECT assigned_to, COUNT(*) AS n FROM followups WHERE org_id = ? AND status = 'pending' GROUP BY assigned_to`,
        user.orgId,
      );
      const pendingMap = new Map(pending.map((p) => [p.assigned_to, p.n]));
      return {
        members: members.map((m) => ({
          ...m,
          leads: statMap.get(m.id)?.leads || 0,
          converted: statMap.get(m.id)?.converted || 0,
          lost: statMap.get(m.id)?.lost || 0,
          pending_followups: pendingMap.get(m.id) || 0,
        })),
        invites: all("SELECT token, email, name, role, created_at, expires_at FROM invites WHERE org_id = ? AND accepted_at IS NULL", user.orgId)
          .map((i) => ({ ...i, invite_url: `${config.appUrl}/invite/${i.token}` })),
        permission_matrix: {
          admin: ["All leads and reports", "Team management and invitations", "Business settings and recovery rules", "Delete leads and records", "Communication and templates"],
          manager: ["All leads and reports", "Assign leads and follow-ups", "Run the recovery engine", "Send messages", "Cannot change business settings or roles"],
          employee: ["Only leads assigned to them", "Their own follow-ups", "Log interactions and schedule follow-ups", "View their own performance", "Cannot delete leads or export the full database"],
        },
      };
    },
  },
  {
    method: "POST", path: "/api/team/invite", capability: "team:manage",
    handler({ user, body }) {
      const email = v.emailAddr(body.email, "Email", { required: true });
      const name = v.str(body.name, "Name", { max: 120 });
      const role = v.pickEnum(body.role, ["admin", "manager", "employee"], "Role", "employee");
      if (one("SELECT id FROM users WHERE email = ?", email)) throw conflict("A team member with that email already exists.", "EMAIL_TAKEN");
      const existing = one("SELECT * FROM invites WHERE org_id = ? AND email = ? AND accepted_at IS NULL", user.orgId, email);
      if (existing) return { invite: { ...existing, invite_url: `${config.appUrl}/invite/${existing.token}` } };
      const token = randomBytes(24).toString("base64url");
      const created = nowIso();
      const expires = new Date(Date.now() + 14 * 86400_000).toISOString();
      run(
        "INSERT INTO invites (token, org_id, email, name, role, created_by, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?)",
        token, user.orgId, email, name, role, user.id, created, expires,
      );
      run(
        "INSERT INTO activity (org_id, user_id, actor, action, entity, detail, created_at) VALUES (?,?,?,?,?,?,?)",
        user.orgId, user.id, user.name, "team.invited", "invite", email, created,
      );
      return { invite: { token, email, name, role, created_at: created, expires_at: expires, invite_url: `${config.appUrl}/invite/${token}` } };
    },
  },
  {
    method: "DELETE", path: "/api/team/invite/:token", capability: "team:manage",
    handler({ user, params }) {
      run("DELETE FROM invites WHERE token = ? AND org_id = ?", params.token, user.orgId);
      return { ok: true };
    },
  },
  {
    method: "PATCH", path: "/api/team/:id", capability: "team:manage",
    handler({ user, params, body }) {
      const member = one("SELECT * FROM users WHERE id = ? AND org_id = ?", Number(params.id), user.orgId);
      if (!member) throw notFound("Team member not found.");
      const role = body.role === undefined ? member.role : v.pickEnum(body.role, ["admin", "manager", "employee"], "Role");
      const status = body.status === undefined ? member.status : v.pickEnum(body.status, ["active", "disabled"], "Status");
      const name = body.name === undefined ? member.name : v.str(body.name, "Name", { required: true, max: 120 });
      if (member.id === user.id && (role !== "admin" || status !== "active")) {
        throw conflict("You cannot remove your own administrator access.", "SELF_DEMOTE");
      }
      if (role !== "admin" || status !== "active") {
        const admins = one("SELECT COUNT(*) AS n FROM users WHERE org_id = ? AND role = 'admin' AND status = 'active'", user.orgId);
        if (member.role === "admin" && admins.n <= 1) throw conflict("A business must keep at least one active administrator.", "LAST_ADMIN");
      }
      run("UPDATE users SET role = ?, status = ?, name = ? WHERE id = ?", role, status, name, member.id);
      if (status === "disabled") run("DELETE FROM sessions WHERE user_id = ?", member.id);
      run("INSERT INTO activity (org_id, user_id, actor, action, entity, entity_id, detail, created_at) VALUES (?,?,?,?,?,?,?,?)",
        user.orgId, user.id, user.name, "team.updated", "user", member.id, `${role}/${status}`, nowIso());
      return { ok: true };
    },
  },
  {
    method: "POST", path: "/api/team/:id/reset-password", capability: "team:manage",
    handler({ user, params, body }) {
      const member = one("SELECT * FROM users WHERE id = ? AND org_id = ?", Number(params.id), user.orgId);
      if (!member) throw notFound("Team member not found.");
      const password = v.str(body.password, "Temporary password", { required: true, max: 200 });
      const issue = passwordIssue(password);
      if (issue) throw bad(issue);
      run("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?", hashPassword(password), member.id);
      run("DELETE FROM sessions WHERE user_id = ?", member.id);
      run("INSERT INTO activity (org_id, user_id, actor, action, entity, entity_id, detail, created_at) VALUES (?,?,?,?,?,?,?,?)",
        user.orgId, user.id, user.name, "team.password_reset", "user", member.id, "", nowIso());
      return { ok: true };
    },
  },
  {
    method: "GET", path: "/api/team/activity", capability: "team:read",
    handler({ user, query }) {
      const limit = Math.min(300, Math.max(10, Number(query.limit) || 100));
      const rows = all(
        `SELECT a.*, u.name AS user_name FROM activity a LEFT JOIN users u ON u.id = a.user_id
          WHERE a.org_id = ? ORDER BY a.created_at DESC LIMIT ?`,
        user.orgId, limit,
      );
      return { activity: rows };
    },
  },
];
