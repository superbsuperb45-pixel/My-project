import { all, logActivity, nowIso, one, run, tx } from "../db.js";
import { statusKind } from "./scoring.js";

const MS_HOUR = 3600_000;

const RULES = [
  {
    key: "no_response",
    label: "No response to a new inquiry",
    severity: 3,
    test(lead, ctx) {
      if (lead.first_response_at) return null;
      const hours = (ctx.now - new Date(lead.received_at).getTime()) / MS_HOUR;
      if (hours < ctx.rules.no_response_hours) return null;
      return `This inquiry has waited ${Math.round(hours)} hours without a first response (target: ${ctx.rules.no_response_hours}h). Call or message now, then log the contact so the clock stops.`;
    },
  },
  {
    key: "no_contact",
    label: "No contact for several days",
    severity: 2,
    test(lead, ctx) {
      const anchor = lead.last_contact_at || lead.received_at;
      const days = (ctx.now - new Date(anchor).getTime()) / 86400_000;
      if (days < ctx.rules.no_contact_days) return null;
      return `No logged contact for ${Math.floor(days)} days (threshold: ${ctx.rules.no_contact_days}). Send a short re-engagement message referencing their original inquiry.`;
    },
  },
  {
    key: "stalled_interest",
    label: "Showed interest but never purchased",
    severity: 2,
    test(lead, ctx) {
      if (!["interested", "follow_up"].includes(lead.status)) return null;
      const anchor = lead.last_contact_at || lead.received_at;
      const days = (ctx.now - new Date(anchor).getTime()) / 86400_000;
      if (days < ctx.rules.stalled_interest_days) return null;
      return `Marked interested ${Math.floor(days)} days ago without a decision. Offer a concrete next step: a quote, a viewing slot or a call at a specific time.`;
    },
  },
  {
    key: "overdue_followup",
    label: "Overdue follow-up",
    severity: 3,
    test(lead, ctx) {
      if (!lead.follow_up_at) return null;
      const hours = (ctx.now - new Date(lead.follow_up_at).getTime()) / MS_HOUR;
      if (hours < 0) return null;
      return `The follow-up due ${lead.follow_up_at.slice(0, 10)} is ${Math.floor(hours / 24)} days overdue. Complete it or reschedule with a reason.`;
    },
  },
  {
    key: "inactive",
    label: "Lead has gone inactive",
    severity: 1,
    test(lead, ctx) {
      const days = (ctx.now - new Date(lead.updated_at).getTime()) / 86400_000;
      if (days < ctx.rules.inactive_days) return null;
      return `No activity on this record for ${Math.floor(days)} days. Decide deliberately: send one final recovery attempt or close it as lost with a reason.`;
    },
  },
];

const CLOSED_STATUSES = new Set(["converted", "lost"]);

/**
 * Evaluate the recovery rules for one organisation and persist the results.
 * Idempotent: an open event per (lead, rule) is created at most once, and events
 * whose condition no longer applies are auto-resolved (kept as history).
 */
export function evaluateRecovery(org, settings, { actor = null, now = Date.now() } = {}) {
  const rules = settings.recovery;
  const orgStatuses = settings.statuses;
  const leads = all(
    `SELECT l.*, (SELECT COUNT(*) FROM interactions i WHERE i.lead_id = l.id) AS interaction_count
       FROM leads l WHERE l.org_id = ?`,
    org.id,
  );
  const events = all("SELECT * FROM recovery_events WHERE org_id = ?", org.id);
  const eventByKey = new Map();
  for (const ev of events) eventByKey.set(`${ev.lead_id}:${ev.rule_key}`, ev);

  const statusKindMap = new Map(orgStatuses.map((s) => [s.key, s.kind || "open"]));
  const closedStatuses = new Set(["converted", "lost", "recovered"]);
  let created = 0;
  let autoResolved = 0;

  tx(() => {
    for (const lead of leads) {
      const kind = statusKindMap.get(lead.status) || statusKind(lead.status, settings);
      // Recovered, converted and lost leads are no longer "neglected" — they are out of the recovery loop.
      const isClosed = CLOSED_STATUSES.has(lead.status) || kind === "won" || kind === "lost" || kind === "recovered";
      for (const rule of RULES) {
        const key = `${lead.id}:${rule.key}`;
        const existing = eventByKey.get(key);
        const recommendation = isClosed ? null : rule.test(lead, { rules, now });
        if (recommendation) {
          if (!existing) {
            run(
              `INSERT INTO recovery_events (org_id, lead_id, rule_key, rule_label, recommendation, severity, status, detected_at)
               VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
               ON CONFLICT(lead_id, rule_key) DO NOTHING`,
              org.id, lead.id, rule.key, rule.label, recommendation, rule.severity, new Date(now).toISOString(),
            );
            created += 1;
          } else if (existing.status !== "open") {
            // The same condition came back after being resolved — reopen and keep history via detection date.
            run(
              `UPDATE recovery_events
                  SET status = 'open', recommendation = ?, severity = ?, resolution = '',
                      resolved_at = NULL, detected_at = ?
                WHERE id = ?`,
              recommendation, rule.severity, new Date(now).toISOString(), existing.id,
            );
            existing.status = "open";
            created += 1;
          } else if (existing.recommendation !== recommendation) {
            run("UPDATE recovery_events SET recommendation = ? WHERE id = ?", recommendation, existing.id);
          }
        } else if (existing && existing.status === "open") {
          run(
            "UPDATE recovery_events SET status = 'resolved', resolution = 'auto_resolved', resolved_at = ? WHERE id = ?",
            new Date(now).toISOString(), existing.id,
          );
          existing.status = "resolved";
          autoResolved += 1;
        }
      }

      // Optional automatic "overdue" status so the list can be filtered by status alone.
      if (rules.auto_overdue && !isClosed) {
        const overdueKey = rules.overdue_status_key || "overdue";
        const overdue = lead.follow_up_at && new Date(lead.follow_up_at).getTime() < now;
        const canMove = orgStatuses.some((s) => s.key === overdueKey);
        if (overdue && canMove && lead.status !== overdueKey && !["converted", "lost", "recovered"].includes(lead.status)) {
          run("UPDATE leads SET status = ?, updated_at = ? WHERE id = ?", overdueKey, new Date(now).toISOString(), lead.id);
        }
      }
    }
  });

  if (created || autoResolved) {
    logActivity(
      org.id, actor, "recovery.evaluated", "recovery", null,
      `${created} new flag(s), ${autoResolved} auto-resolved`,
    );
  }
  return { created, autoResolved, evaluated: leads.length };
}

export function recoverySummary(orgId, settings) {
  const open = all(
    `SELECT rule_key, rule_label, COUNT(*) AS count, MAX(severity) AS severity
       FROM recovery_events WHERE org_id = ? AND status = 'open' GROUP BY rule_key ORDER BY severity DESC`,
    orgId,
  );
  return open;
}

export function resolveEventsForLead(orgId, leadId, resolution, { actor = null, ruleKeys = null } = {}) {
  const now = nowIso();
  if (ruleKeys?.length) {
    for (const key of ruleKeys) {
      run(
        `UPDATE recovery_events SET status = 'resolved', resolution = ?, resolved_at = ?, resolved_by = ?
          WHERE org_id = ? AND lead_id = ? AND rule_key = ? AND status = 'open'`,
        resolution, now, actor?.id ?? null, orgId, leadId, key,
      );
    }
    return;
  }
  run(
    `UPDATE recovery_events SET status = 'resolved', resolution = ?, resolved_at = ?, resolved_by = ?
      WHERE org_id = ? AND lead_id = ? AND status = 'open'`,
    resolution, now, actor?.id ?? null, orgId, leadId,
  );
}

export function markRecovered(orgId, leadId, { actor, recoveredValue = null } = {}) {
  const lead = one("SELECT * FROM leads WHERE id = ? AND org_id = ?", leadId, orgId);
  if (!lead) return null;
  const now = nowIso();
  const value = recoveredValue == null ? lead.deal_value : recoveredValue;
  run(
    `UPDATE leads SET status = 'recovered', recovered_at = ?, recovered_value = ?, lost_at = NULL, lost_reason = '', updated_at = ?
      WHERE id = ? AND org_id = ?`,
    now, value, now, leadId, orgId,
  );
  run(
    `UPDATE recovery_events SET status = 'resolved', resolution = 'recovered', resolved_at = ?, resolved_by = ?
      WHERE org_id = ? AND lead_id = ? AND status = 'open'`,
    now, actor?.id ?? null, orgId, leadId,
  );
  return value;
}

export const RECOVERY_RULES = RULES.map(({ key, label, severity }) => ({ key, label, severity }));
