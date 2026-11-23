import { all, db, getSettings, logActivity, nowIso, one, run, tx } from "../db.js";
import { assertLeadAccess, can, canSeeAllLeads, hashPassword, leadScope, normalizeEmail, passwordIssue, requireCapability, verifyPassword } from "../auth.js";
import { AppError, bad, conflict, forbidden, notFound } from "../http.js";
import * as v from "../services/validate.js";
import { medianDealValue, scoreLead } from "../services/scoring.js";
import { resolveEventsForLead, markRecovered } from "../services/engine.js";
import { mapHeaders, parseCsv, toCsv } from "../services/csv.js";

export function statusKeys(settings) {
  return settings.statuses.map((s) => s.key);
}

export function attachScores(rows, orgId, settings) {
  const ids = rows.map((r) => r.id);
  if (!ids.length) return rows;
  const placeholders = ids.map(() => "?").join(",");
  const counts = new Map(
    all(`SELECT lead_id, COUNT(*) AS n FROM interactions WHERE org_id = ? AND lead_id IN (${placeholders}) GROUP BY lead_id`, orgId, ...ids)
      .map((r) => [r.lead_id, r.n]),
  );
  const openCounts = new Map(
    all(`SELECT lead_id, COUNT(*) AS n FROM recovery_events WHERE org_id = ? AND status = 'open' AND lead_id IN (${placeholders}) GROUP BY lead_id`, orgId, ...ids)
      .map((r) => [r.lead_id, r.n]),
  );
  const median = medianDealValue(all("SELECT deal_value FROM leads WHERE org_id = ?", orgId));
  return rows.map((row) => ({
    ...row,
    score: scoreLead(row, {
      settings,
      medianValue: median,
      interactionCount: counts.get(row.id) || 0,
      openRecoveries: openCounts.get(row.id) || 0,
    }),
    open_recovery_flags: openCounts.get(row.id) || 0,
    interaction_count: counts.get(row.id) || 0,
  }));
}

export function serializeLead(row) {
  if (!row) return null;
  return {
    ...row,
    opted_out: Boolean(row.opted_out),
    deal_value: Number(row.deal_value) || 0,
    is_recovered: Boolean(row.recovered_at),
    is_overdue_followup: Boolean(row.follow_up_at && new Date(row.follow_up_at).getTime() < Date.now() && !["converted", "lost"].includes(row.status)),
  };
}

export function getLeadOr404(user, id) {
  const lead = one("SELECT * FROM leads WHERE id = ?", Number(id));
  if (!lead) throw notFound("Lead not found.");
  assertLeadAccess(user, lead);
  return lead;
}

function ensureAssignee(orgId, userId) {
  if (!userId) return null;
  const member = one("SELECT id FROM users WHERE id = ? AND org_id = ? AND status = 'active'", userId, orgId);
  if (!member) throw bad("Assigned team member was not found in this business.");
  return userId;
}

function normalizeLeadPayload(body, { orgId, settings, partial = false, existing = null }) {
  const src = (key, fallback = "") => (body[key] === undefined ? (partial ? existing?.[key] ?? fallback : fallback) : body[key]);
  const name = v.str(src("name"), "Customer name", { required: !partial || body.name !== undefined, max: 160 });
  const email = v.emailAddr(src("email") ?? "", "Email address", { required: false });
  const phone = v.phoneNumber(src("phone") ?? "", "Phone number", { required: false });
  if (!email && !phone) throw bad("Provide at least a phone number or an email address so this lead can be contacted.");
  const status = v.pickEnum(src("status", "new"), statusKeys(settings), "Lead status", "new");
  const received = v.isoDate(src("received_at", nowIso()), "Date received", { required: true });
  return {
    name,
    email,
    phone,
    company: v.str(src("company"), "Company", { max: 160 }),
    source: v.str(src("source"), "Lead source", { max: 120 }),
    status,
    deal_value: v.money(src("deal_value"), "Potential deal value"),
    assigned_to: ensureAssignee(orgId, src("assigned_to") ? Number(src("assigned_to")) : null),
    received_at: received,
    last_contact_at: v.isoDate(src("last_contact_at"), "Last contact date"),
    follow_up_at: v.isoDate(src("follow_up_at"), "Follow-up date"),
    notes: v.str(src("notes"), "Notes", { max: 5000 }),
    lost_reason: v.str(src("lost_reason"), "Lost reason", { max: 300 }),
    consent: v.pickEnum(src("consent", "unknown"), ["unknown", "granted", "revoked"], "Consent status", "unknown"),
  };
}

export const leadRoutes = [
  {
    method: "GET", path: "/api/leads", capability: "lead:read_own",
    handler({ user, query, settings }) {
      const scope = leadScope(user, "l");
      const where = [scope.sql];
      const params = [...scope.params];
      if (query.q) {
        where.push("(l.name LIKE ? OR l.email LIKE ? OR l.phone LIKE ? OR l.company LIKE ? OR l.notes LIKE ?)");
        const like = `%${String(query.q).trim()}%`;
        params.push(like, like, like, like, like);
      }
      if (query.status) { where.push("l.status = ?"); params.push(String(query.status)); }
      if (query.source) { where.push("l.source = ?"); params.push(String(query.source)); }
      if (query.assigned) { where.push("l.assigned_to = ?"); params.push(Number(query.assigned)); }
      if (query.overdue === "1") { where.push("l.follow_up_at IS NOT NULL AND l.follow_up_at < ? AND l.status NOT IN ('converted','lost')"); params.push(nowIso()); }
      if (query.unanswered === "1") { where.push("l.first_response_at IS NULL AND l.status NOT IN ('converted','lost')"); }
      if (query.from) { where.push("l.received_at >= ?"); params.push(new Date(query.from).toISOString()); }
      if (query.to) { const d = new Date(query.to); d.setUTCHours(23, 59, 59, 999); where.push("l.received_at <= ?"); params.push(d.toISOString()); }
      if (query.recovered === "1") where.push("l.recovered_at IS NOT NULL");
      if (query.lost === "1") where.push("l.status = 'lost' AND l.recovered_at IS NULL");

      const rows = all(
        `SELECT l.*, u.name AS assignee_name FROM leads l LEFT JOIN users u ON u.id = l.assigned_to
          WHERE ${where.join(" AND ")} ORDER BY l.received_at DESC`,
        ...params,
      );
      let scored = attachScores(rows.map(serializeLead), user.orgId, settings);
      const sort = String(query.sort || "priority");
      const sorters = {
        priority: (a, b) => b.score.score - a.score.score || new Date(b.received_at) - new Date(a.received_at),
        recent: (a, b) => new Date(b.received_at) - new Date(a.received_at),
        value: (a, b) => b.deal_value - a.deal_value,
        followup: (a, b) => (a.follow_up_at || "9999") < (b.follow_up_at || "9999") ? -1 : 1,
        name: (a, b) => a.name.localeCompare(b.name),
      };
      scored.sort(sorters[sort] || sorters.priority);
      const page = Math.max(1, Number(query.page) || 1);
      const limit = Math.min(200, Math.max(5, Number(query.limit) || 25));
      const total = scored.length;
      return {
        leads: scored.slice((page - 1) * limit, page * limit),
        total,
        page,
        limit,
        pages: Math.max(1, Math.ceil(total / limit)),
      };
    },
  },
  {
    method: "POST", path: "/api/leads", capability: "lead:write_own",
    handler({ user, body, settings }) {
      const data = normalizeLeadPayload(body, { orgId: user.orgId, settings });
      if (!data.assigned_to) data.assigned_to = user.id;
      if (!canSeeAllLeads(user) && data.assigned_to !== user.id) throw forbidden("You can only assign leads to yourself.");
      const now = nowIso();
      const result = run(
        `INSERT INTO leads (org_id, name, phone, email, company, source, status, deal_value, assigned_to,
            received_at, last_contact_at, follow_up_at, notes, lost_reason, consent, created_at, updated_at, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        user.orgId, data.name, data.phone, data.email, data.company, data.source, data.status, data.deal_value,
        data.assigned_to, data.received_at, data.last_contact_at, data.follow_up_at, data.notes, data.lost_reason,
        data.consent, now, now, user.id,
      );
      const lead = one("SELECT * FROM leads WHERE id = ?", Number(result.lastInsertRowid));
      if (data.follow_up_at) {
        run(
          `INSERT INTO followups (org_id, lead_id, assigned_to, due_at, channel, note, status, created_by, created_at)
           VALUES (?,?,?,?,?,?,'pending',?,?)`,
          user.orgId, lead.id, lead.assigned_to, data.follow_up_at, "call", "Initial follow-up scheduled with the lead.", user.id, now,
        );
      }
      logActivity(user.orgId, user, "lead.created", "lead", lead.id, lead.name);
      return { lead: serializeLead(lead) };
    },
  },
  {
    method: "GET", path: "/api/leads/:id", capability: "lead:read_own",
    handler({ user, params, settings }) {
      const lead = getLeadOr404(user, params.id);
      const [withScore] = attachScores([serializeLead(lead)], user.orgId, settings);
      const interactions = all(
        `SELECT i.*, u.name AS user_name FROM interactions i LEFT JOIN users u ON u.id = i.user_id
          WHERE i.lead_id = ? AND i.org_id = ? ORDER BY i.created_at DESC LIMIT 200`,
        lead.id, user.orgId,
      );
      const followups = all(
        `SELECT f.*, u.name AS assignee_name FROM followups f LEFT JOIN users u ON u.id = f.assigned_to
          WHERE f.lead_id = ? AND f.org_id = ? ORDER BY f.due_at DESC LIMIT 100`,
        lead.id, user.orgId,
      );
      const recovery = all(
        "SELECT * FROM recovery_events WHERE lead_id = ? AND org_id = ? ORDER BY detected_at DESC",
        lead.id, user.orgId,
      );
      const messages = all(
        "SELECT id, channel, direction, subject, body, status, provider, error, created_at, sent_at FROM messages WHERE lead_id = ? AND org_id = ? ORDER BY created_at DESC LIMIT 100",
        lead.id, user.orgId,
      );
      const assignee = lead.assigned_to ? one("SELECT id, name FROM users WHERE id = ?", lead.assigned_to) : null;
      return { lead: { ...withScore, assignee_name: assignee?.name || "" }, interactions, followups, recovery, messages };
    },
  },
  {
    method: "PATCH", path: "/api/leads/:id", capability: "lead:write_own",
    handler({ user, params, body, settings }) {
      const lead = getLeadOr404(user, params.id);
      const data = normalizeLeadPayload(body, { orgId: user.orgId, settings, partial: true, existing: lead });
      if (!canSeeAllLeads(user) && data.assigned_to && data.assigned_to !== lead.assigned_to && data.assigned_to !== user.id) {
        throw forbidden("Only managers can reassign leads to other team members.");
      }
      const now = nowIso();
      const closed = { converted: lead.converted_at, lost: lead.lost_at }[data.status] ?? null;
      run(
        `UPDATE leads SET name=?, phone=?, email=?, company=?, source=?, status=?, deal_value=?, assigned_to=?,
            received_at=?, last_contact_at=?, follow_up_at=?, notes=?, lost_reason=?, consent=?,
            converted_at = CASE WHEN ? = 'converted' THEN COALESCE(converted_at, ?) WHEN ? <> 'converted' THEN converted_at END,
            lost_at = CASE WHEN ? = 'lost' THEN COALESCE(lost_at, ?) WHEN ? <> 'lost' THEN lost_at END,
            updated_at=?
          WHERE id=? AND org_id=?`,
        data.name, data.phone, data.email, data.company, data.source, data.status, data.deal_value, data.assigned_to,
        data.received_at, data.last_contact_at, data.follow_up_at, data.notes, data.lost_reason, data.consent,
        data.status, now, data.status,
        data.status, now, data.status,
        now, lead.id, user.orgId,
      );
      if (data.status === "converted" && !lead.recovered_at) {
        resolveEventsForLead(user.orgId, lead.id, "converted", { actor: user });
      }
      const updated = one("SELECT * FROM leads WHERE id = ?", lead.id);
      logActivity(user.orgId, user, "lead.updated", "lead", lead.id, `${lead.name} → ${updated.status}`);
      return { lead: serializeLead(updated) };
    },
  },
  {
    method: "DELETE", path: "/api/leads/:id", capability: "lead:delete",
    handler({ user, params }) {
      const lead = getLeadOr404(user, params.id);
      run("DELETE FROM leads WHERE id = ? AND org_id = ?", lead.id, user.orgId);
      logActivity(user.orgId, user, "lead.deleted", "lead", lead.id, lead.name);
      return { ok: true };
    },
  },
  {
    method: "POST", path: "/api/leads/:id/interactions", capability: "lead:write_own",
    handler({ user, params, body, settings }) {
      const lead = getLeadOr404(user, params.id);
      const type = v.pickEnum(body.type, ["call", "email", "whatsapp", "sms", "meeting", "note", "visit"], "Interaction type", "note");
      const outcome = v.pickEnum(body.outcome, ["none", "response", "new_opportunity", "conversion", "no_response"], "Outcome", "none");
      const summary = v.str(body.summary, "Summary", { required: true, max: 2000 });
      const at = v.isoDate(body.at, "Interaction date") || nowIso();
      const direction = v.pickEnum(body.direction, ["outbound", "inbound", "internal"], "Direction", "outbound");
      const nextStatus = body.status ? v.pickEnum(body.status, statusKeys(settings), "Lead status") : null;

      const id = tx(() => {
        const res = run(
          `INSERT INTO interactions (org_id, lead_id, user_id, type, channel, direction, summary, outcome, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          user.orgId, lead.id, user.id, type, type, direction, summary, outcome, at,
        );
        const isResponse = direction === "inbound" || ["response", "new_opportunity", "conversion"].includes(outcome);
        run(
          `UPDATE leads SET last_contact_at = ?, first_response_at = COALESCE(first_response_at, ?),
              status = ?, updated_at = ?
            WHERE id = ? AND org_id = ?`,
          at, isResponse ? at : null,
          nextStatus || (lead.status === "new" ? (outcome === "no_response" ? "contacted" : "contacted") : lead.status),
          nowIso(), lead.id, user.orgId,
        );
        return Number(res.lastInsertRowid);
      });
      resolveEventsForLead(user.orgId, lead.id, "contact_logged", { actor: user });
      logActivity(user.orgId, user, "lead.interaction", "lead", lead.id, `${type}: ${summary.slice(0, 120)}`);
      const updated = one("SELECT * FROM leads WHERE id = ?", lead.id);
      return { interaction: one("SELECT * FROM interactions WHERE id = ?", id), lead: serializeLead(updated) };
    },
  },
  {
    method: "POST", path: "/api/leads/:id/followups", capability: "followup:write_own",
    handler({ user, params, body }) {
      const lead = getLeadOr404(user, params.id);
      const due = v.isoDate(body.due_at, "Follow-up date", { required: true });
      const channel = v.pickEnum(body.channel, ["call", "email", "whatsapp", "sms", "meeting"], "Channel", "call");
      const assigned = body.assigned_to ? Number(body.assigned_to) : lead.assigned_to || user.id;
      if (!canSeeAllLeads(user) && assigned !== user.id) throw forbidden("You can only schedule follow-ups for yourself.");
      ensureAssignee(user.orgId, assigned);
      const res = run(
        `INSERT INTO followups (org_id, lead_id, assigned_to, due_at, channel, note, status, created_by, created_at)
         VALUES (?,?,?,?,?,?,'pending',?,?)`,
        user.orgId, lead.id, assigned, due, channel, v.str(body.note, "Note", { max: 1000 }), user.id, nowIso(),
      );
      run("UPDATE leads SET follow_up_at = ?, updated_at = ? WHERE id = ?", due, nowIso(), lead.id);
      logActivity(user.orgId, user, "followup.scheduled", "lead", lead.id, `Due ${due.slice(0, 10)}`);
      return { followup: one("SELECT * FROM followups WHERE id = ?", Number(res.lastInsertRowid)) };
    },
  },
  {
    method: "POST", path: "/api/leads/:id/recover", capability: "recovery:manage",
    handler({ user, params, body }) {
      const lead = getLeadOr404(user, params.id);
      if (!lead.recovered_at && !one("SELECT id FROM recovery_events WHERE lead_id = ? AND status = 'open'", lead.id)) {
        throw conflict("This lead has no open recovery flag. Use 'Log interaction' to move it forward, or 'Mark recovered' after a genuine comeback.", "NOT_RECOVERABLE");
      }
      const value = body.recovered_value === undefined ? null : v.money(body.recovered_value, "Recovered value");
      markRecovered(user.orgId, lead.id, { actor: user, recoveredValue: value });
      logActivity(user.orgId, user, "lead.recovered", "lead", lead.id, lead.name);
      return { lead: serializeLead(one("SELECT * FROM leads WHERE id = ?", lead.id)) };
    },
  },
  {
    method: "POST", path: "/api/leads/:id/convert", capability: "lead:write_own",
    handler({ user, params, body }) {
      const lead = getLeadOr404(user, params.id);
      const value = body.deal_value === undefined ? lead.deal_value : v.money(body.deal_value, "Deal value");
      const at = v.isoDate(body.at, "Conversion date") || nowIso();
      run(
        `UPDATE leads SET status='converted', deal_value=?, converted_at=?, lost_at=NULL, lost_reason='', updated_at=?
          WHERE id=? AND org_id=?`,
        value, at, nowIso(), lead.id, user.orgId,
      );
      resolveEventsForLead(user.orgId, lead.id, lead.recovered_at ? "recovered_conversion" : "converted", { actor: user });
      logActivity(user.orgId, user, "lead.converted", "lead", lead.id, `${lead.name} — ${value}`);
      return { lead: serializeLead(one("SELECT * FROM leads WHERE id = ?", lead.id)) };
    },
  },
  {
    method: "POST", path: "/api/leads/:id/lost", capability: "lead:write_own",
    handler({ user, params, body }) {
      const lead = getLeadOr404(user, params.id);
      const reason = v.str(body.lost_reason, "Lost reason", { required: true, max: 300 });
      run(
        "UPDATE leads SET status='lost', lost_reason=?, lost_at=?, updated_at=? WHERE id=? AND org_id=?",
        reason, body.at ? v.isoDate(body.at, "Lost date") : nowIso(), nowIso(), lead.id, user.orgId,
      );
      resolveEventsForLead(user.orgId, lead.id, "marked_lost", { actor: user });
      logActivity(user.orgId, user, "lead.lost", "lead", lead.id, reason);
      return { lead: serializeLead(one("SELECT * FROM leads WHERE id = ?", lead.id)) };
    },
  },
  {
    method: "POST", path: "/api/leads/:id/assign", capability: "lead:write_all",
    handler({ user, params, body }) {
      const lead = getLeadOr404(user, params.id);
      const assigned = body.user_id ? Number(body.user_id) : null;
      ensureAssignee(user.orgId, assigned);
      run("UPDATE leads SET assigned_to = ?, updated_at = ? WHERE id = ? AND org_id = ?", assigned, nowIso(), lead.id, user.orgId);
      logActivity(user.orgId, user, "lead.assigned", "lead", lead.id, String(assigned || "unassigned"));
      return { lead: serializeLead(one("SELECT * FROM leads WHERE id = ?", lead.id)) };
    },
  },
  {
    method: "PATCH", path: "/api/leads/:id/consent", capability: "lead:write_own",
    handler({ user, params, body }) {
      const lead = getLeadOr404(user, params.id);
      const consent = v.pickEnum(body.consent, ["unknown", "granted", "revoked"], "Consent status");
      const optedOut = consent === "revoked" ? 1 : 0;
      run("UPDATE leads SET consent = ?, opted_out = ?, updated_at = ? WHERE id = ? AND org_id = ?",
        consent, optedOut, nowIso(), lead.id, user.orgId);
      logActivity(user.orgId, user, "lead.consent", "lead", lead.id, consent);
      return { lead: serializeLead(one("SELECT * FROM leads WHERE id = ?", lead.id)) };
    },
  },
  {
    method: "POST", path: "/api/leads/import", capability: "import:csv",
    handler({ user, body, settings }) {
      const csv = String(body.csv || "");
      if (!csv.trim()) throw bad("Paste CSV content or upload a CSV file first.");
      if (Buffer.byteLength(csv) > 4_000_000) throw bad("CSV file is too large (4 MB max).");
      const rows = parseCsv(csv);
      if (rows.length < 2) throw bad("The CSV needs a header row and at least one data row.");
      const mapping = mapHeaders(rows[0]);
      if (mapping.name == null) throw bad("Could not find a customer name column. Rename a column to 'name' or 'customer name'.");
      if (mapping.phone == null && mapping.email == null) throw bad("Could not find a phone or email column.");
      const team = all("SELECT id, name, email FROM users WHERE org_id = ?", user.orgId);
      const preview = [];
      const errors = [];
      const valid = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const get = (key) => (mapping[key] != null ? String(r[mapping[key]] ?? "").trim() : "");
        const raw = {
          name: get("name"),
          phone: get("phone"),
          email: get("email"),
          company: get("company"),
          source: get("source"),
          status: get("status"),
          deal_value: get("deal_value"),
          assigned_to: get("assigned_to"),
          received_at: get("received_at"),
          last_contact_at: get("last_contact_at"),
          follow_up_at: get("follow_up_at"),
          notes: get("notes"),
          consent: get("consent"),
        };
        if (!raw.name) { errors.push({ row: i + 1, message: "Missing customer name." }); continue; }
        if (!raw.phone && !raw.email) { errors.push({ row: i + 1, message: "Missing phone and email." }); continue; }
        let email = raw.email.toLowerCase();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { errors.push({ row: i + 1, message: `Invalid email "${raw.email}".` }); continue; }
        let phone = raw.phone;
        if (phone && phone.replace(/[^\d]/g, "").length < 6) { errors.push({ row: i + 1, message: `Invalid phone "${raw.phone}".` }); continue; }
        let status = raw.status.toLowerCase().replace(/[\s-]+/g, "_");
        const statusAliases = { follow_up_required: "follow_up", followup_required: "follow_up", won: "converted", closed_won: "converted", closed_lost: "lost", new_lead: "new" };
        status = statusAliases[status] || status;
        if (!statusKeys(settings).includes(status)) status = "new";
        let assigned = null;
        if (raw.assigned_to) {
          const match = team.find((t) => t.name.toLowerCase() === raw.assigned_to.toLowerCase() || t.email.toLowerCase() === raw.assigned_to.toLowerCase());
          if (match) assigned = match.id;
        }
        const parseDate = (val, fallback = null) => {
          if (!val) return fallback;
          const d = new Date(val);
          return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
        };
        const consentRaw = raw.consent.toLowerCase();
        const consent = ["granted", "yes", "true", "1", "opt in", "opted in"].includes(consentRaw) ? "granted"
          : ["revoked", "no", "false", "0", "opt out", "opted out"].includes(consentRaw) ? "revoked" : "unknown";
        const record = {
          name: raw.name,
          phone,
          email,
          company: raw.company,
          source: raw.source,
          status,
          deal_value: Number(String(raw.deal_value).replace(/[^\d.-]/g, "")) || 0,
          assigned_to: assigned ?? user.id,
          received_at: parseDate(raw.received_at, nowIso()),
          last_contact_at: parseDate(raw.last_contact_at),
          follow_up_at: parseDate(raw.follow_up_at),
          notes: raw.notes,
          consent,
        };
        preview.push(record);
        valid.push(record);
      }
      const duplicateEmails = new Set(
        all("SELECT email FROM leads WHERE org_id = ? AND email <> ''", user.orgId).map((r) => r.email.toLowerCase()),
      );
      const duplicates = valid.filter((r) => r.email && duplicateEmails.has(r.email)).length;
      const deduped = body.skip_duplicates ? valid.filter((r) => !r.email || !duplicateEmails.has(r.email)) : valid;

      if (body.dry_run) return { preview: preview.slice(0, 50), total_rows: rows.length - 1, valid: valid.length, duplicates, errors: errors.slice(0, 50), error_count: errors.length };

      const now = nowIso();
      let inserted = 0;
      tx(() => {
        for (const r of deduped) {
          run(
            `INSERT INTO leads (org_id, name, phone, email, company, source, status, deal_value, assigned_to,
                received_at, last_contact_at, follow_up_at, notes, consent, created_at, updated_at, created_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            user.orgId, r.name, r.phone, r.email, r.company, r.source, r.status, r.deal_value, r.assigned_to,
            r.received_at, r.last_contact_at, r.follow_up_at, r.notes, r.consent, now, now, user.id,
          );
          inserted += 1;
        }
      });
      logActivity(user.orgId, user, "lead.imported", "lead", null, `${inserted} leads imported from CSV`);
      return { imported: inserted, skipped: valid.length - deduped.length, duplicates, errors: errors.slice(0, 50), error_count: errors.length };
    },
  },
  {
    method: "GET", path: "/api/leads/export.csv", capability: "export:csv", raw: true,
    handler({ user, res, query, settings }) {
      const scope = leadScope(user, "l");
      const rows = one ? all(
        `SELECT l.*, u.name AS assignee_name FROM leads l LEFT JOIN users u ON u.id = l.assigned_to
          WHERE ${scope.sql} ORDER BY l.received_at DESC`, ...scope.params,
      ) : [];
      const headers = ["id", "name", "phone", "email", "company", "source", "status", "deal_value", "assigned_to",
        "received_at", "last_contact_at", "first_response_at", "follow_up_at", "recovered_at", "converted_at",
        "lost_reason", "consent", "notes"];
      const csv = toCsv(headers, rows.map((r) => ({
        ...r, assigned_to: r.assignee_name || "", deal_value: Number(r.deal_value).toFixed(2),
      })));
      res.writeHead(200, {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="leadrescue-leads-${nowIso().slice(0, 10)}.csv"`,
        "cache-control": "no-store",
      });
      res.end(csv);
      return null;
    },
  },
];
