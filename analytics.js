import { all, one } from "../db.js";
import { canSeeAllLeads } from "../auth.js";

const MS_DAY = 86400_000;

export function parseRange(query = {}, defaults = { days: 30 }) {
  const to = query.to ? new Date(query.to) : new Date();
  if (Number.isNaN(to.getTime())) throw Object.assign(new Error("Invalid 'to' date."), { status: 400 });
  let from;
  if (query.from) {
    from = new Date(query.from);
    if (Number.isNaN(from.getTime())) throw Object.assign(new Error("Invalid 'from' date."), { status: 400 });
  } else {
    from = new Date(to.getTime() - defaults.days * MS_DAY);
  }
  if (from > to) throw Object.assign(new Error("'from' must be before 'to'."), { status: 400 });
  // Inclusive end-of-day for date-only inputs.
  const end = new Date(to);
  if (typeof query.to === "string" && query.to.length === 10) end.setUTCHours(23, 59, 59, 999);
  return { fromIso: from.toISOString(), toIso: end.toISOString(), from, to: end };
}

export function scopeFilter(user, { assignedTo = null } = {}) {
  if (!canSeeAllLeads(user)) return { sql: " AND assigned_to = ?", params: [user.id] };
  if (assignedTo) return { sql: " AND assigned_to = ?", params: [Number(assignedTo)] };
  return { sql: "", params: [] };
}

export function loadLeads(user, range, { assignedTo = null, includeOutsideRange = true } = {}) {
  const scope = scopeFilter(user, { assignedTo });
  const rows = all(
    `SELECT * FROM leads WHERE org_id = ?${scope.sql} ORDER BY received_at ASC`,
    user.orgId, ...scope.params,
  );
  if (!range || includeOutsideRange === false) return rows;
  return rows;
}

export function leadMetrics(leads, { now = Date.now(), settings } = {}) {
  const openKinds = new Set(["open"]);
  const statusKindOf = (s) => settings?.statuses?.find((x) => x.key === s)?.kind || "open";
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  let converted = 0, lost = 0, recovered = 0, unanswered = 0, followupsDue = 0, overdueFollowups = 0;
  let newLeads = 0, pipelineValue = 0, recoveredRevenue = 0, convertedRevenue = 0, totalValue = 0;
  let responseHours = [], conversionDays = [];

  for (const l of leads) {
    const kind = statusKindOf(l.status);
    totalValue += Number(l.deal_value) || 0;
    if (l.status === "new") newLeads += 1;
    if (l.status === "converted" || kind === "won") {
      converted += 1;
      convertedRevenue += Number(l.deal_value) || 0;
      if (l.converted_at && l.received_at) {
        conversionDays.push((new Date(l.converted_at) - new Date(l.received_at)) / MS_DAY);
      }
    } else if (l.status === "lost" || kind === "lost") {
      lost += 1;
    }
    if (l.recovered_at) {
      recovered += 1;
      if (l.status === "converted" || kind === "won" || l.status === "recovered") {
        recoveredRevenue += Number(l.recovered_value ?? l.deal_value) || 0;
      }
    }
    if (!l.first_response_at && !["converted", "lost"].includes(l.status) && kind !== "won") unanswered += 1;
    if (l.follow_up_at && !["converted", "lost"].includes(l.status) && kind !== "won") {
      const due = new Date(l.follow_up_at).getTime();
      if (due <= endOfToday.getTime()) followupsDue += 1;
      if (due < now) overdueFollowups += 1;
    }
    if (!["converted", "lost"].includes(l.status) && kind === "open") pipelineValue += Number(l.deal_value) || 0;
    if (l.first_response_at && l.received_at) {
      responseHours.push((new Date(l.first_response_at) - new Date(l.received_at)) / 3600_000);
    }
  }

  const total = leads.length;
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  return {
    total_leads: total,
    new_leads: newLeads,
    unanswered_leads: unanswered,
    followups_due: followupsDue,
    overdue_followups: overdueFollowups,
    recovered_leads: recovered,
    converted_customers: converted,
    lost_opportunities: lost,
    conversion_rate: total ? Math.round((converted / total) * 1000) / 10 : 0,
    recovered_revenue: Math.round(recoveredRevenue * 100) / 100,
    converted_revenue: Math.round(convertedRevenue * 100) / 100,
    pipeline_value: Math.round(pipelineValue * 100) / 100,
    avg_response_hours: responseHours.length ? Math.round(avg(responseHours) * 10) / 10 : null,
    avg_conversion_days: conversionDays.length ? Math.round(avg(conversionDays) * 10) / 10 : null,
    recovered_conversions: leads.filter((l) => l.recovered_at && (l.status === "converted" || statusKindOf(l.status) === "won")).length,
  };
}

function bucketKey(iso, granularity) {
  const d = new Date(iso);
  if (granularity === "month") return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  if (granularity === "week") {
    const monday = new Date(d);
    const day = (monday.getUTCDay() + 6) % 7;
    monday.setUTCDate(monday.getUTCDate() - day);
    return monday.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

function bucketsBetween(from, to, granularity) {
  const out = [];
  const cursor = new Date(from);
  if (granularity === "month") cursor.setUTCDate(1);
  if (granularity === "week") cursor.setUTCDate(cursor.getUTCDate() - ((cursor.getUTCDay() + 6) % 7));
  let guard = 0;
  while (cursor <= to && guard++ < 400) {
    out.push(bucketKey(cursor.toISOString(), granularity));
    if (granularity === "month") cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + (granularity === "week" ? 7 : 1));
  }
  return out;
}

export function dashboard(user, range, settings, { granularity = null } = {}) {
  const scope = scopeFilter(user);
  const leads = all(`SELECT * FROM leads WHERE org_id = ?${scope.sql}`, user.orgId, ...scope.params);
  const metrics = leadMetrics(leads, { settings });

  const days = Math.max(1, Math.round((range.to - range.from) / MS_DAY));
  const gran = granularity || (days > 120 ? "month" : days > 45 ? "week" : "day");
  const keys = bucketsBetween(range.from, range.to, gran);

  const acquisition = new Map(keys.map((k) => [k, 0]));
  const conversions = new Map(keys.map((k) => [k, 0]));
  const recoveredSeries = new Map(keys.map((k) => [k, 0]));
  const lostSeries = new Map(keys.map((k) => [k, 0]));
  for (const l of leads) {
    const rk = bucketKey(l.received_at, gran);
    if (acquisition.has(rk)) acquisition.set(rk, acquisition.get(rk) + 1);
    if (l.converted_at) {
      const ck = bucketKey(l.converted_at, gran);
      if (conversions.has(ck)) conversions.set(ck, conversions.get(ck) + 1);
    }
    if (l.recovered_at) {
      const ok = bucketKey(l.recovered_at, gran);
      if (recoveredSeries.has(ok)) recoveredSeries.set(ok, recoveredSeries.get(ok) + 1);
    }
    if (l.lost_at) {
      const lk = bucketKey(l.lost_at, gran);
      if (lostSeries.has(lk)) lostSeries.set(lk, lostSeries.get(lk) + 1);
    }
  }

  const flagged = all(
    `SELECT detected_at, status, resolution, lead_id FROM recovery_events WHERE org_id = ?
       AND detected_at >= ? AND detected_at <= ?`,
    user.orgId, range.fromIso, range.toIso,
  );
  const openFlags = one(
    "SELECT COUNT(*) AS n, COUNT(DISTINCT lead_id) AS leads FROM recovery_events WHERE org_id = ? AND status = 'open'",
    user.orgId,
  );
  const flaggedSeries = new Map(keys.map((k) => [k, 0]));
  for (const f of flagged) {
    const k = bucketKey(f.detected_at, gran);
    if (flaggedSeries.has(k)) flaggedSeries.set(k, flaggedSeries.get(k) + 1);
  }

  const bySource = new Map();
  for (const l of leads) {
    const key = l.source || "Unattributed";
    const entry = bySource.get(key) || { source: key, leads: 0, converted: 0, lost: 0, revenue: 0, recovered: 0 };
    entry.leads += 1;
    if (l.status === "converted") { entry.converted += 1; entry.revenue += Number(l.deal_value) || 0; }
    if (l.status === "lost") entry.lost += 1;
    if (l.recovered_at) entry.recovered += 1;
    bySource.set(key, entry);
  }
  const sources = [...bySource.values()]
    .map((s) => ({ ...s, revenue: Math.round(s.revenue * 100) / 100, conversion_rate: s.leads ? Math.round((s.converted / s.leads) * 1000) / 10 : 0 }))
    .sort((a, b) => b.leads - a.leads);

  const statusCounts = new Map();
  for (const l of leads) statusCounts.set(l.status, (statusCounts.get(l.status) || 0) + 1);
  const statusBreakdown = settings.statuses.map((s) => ({ ...s, count: statusCounts.get(s.key) || 0 }));

  const followupStats = all(
    `SELECT f.*, l.name AS lead_name FROM followups f JOIN leads l ON l.id = f.lead_id
      WHERE f.org_id = ? AND f.created_at >= ? AND f.created_at <= ?`,
    user.orgId, range.fromIso, range.toIso,
  );
  const completed = followupStats.filter((f) => f.status === "completed");
  const onTime = completed.filter((f) => f.completed_at && new Date(f.completed_at) <= new Date(f.due_at));
  const responded = completed.filter((f) => ["response", "new_opportunity", "conversion"].includes(f.outcome));
  const outcomeCounts = {};
  for (const f of completed) outcomeCounts[f.outcome || "none"] = (outcomeCounts[f.outcome || "none"] || 0) + 1;

  const series = keys.map((k) => ({
    bucket: k,
    leads: acquisition.get(k) || 0,
    converted: conversions.get(k) || 0,
    recovered: recoveredSeries.get(k) || 0,
    lost: lostSeries.get(k) || 0,
    flagged: flaggedSeries.get(k) || 0,
  }));

  const recoveredConverted = leads.filter((l) => l.recovered_at && l.status === "converted").length;

  return {
    range: { from: range.fromIso, to: range.toIso, granularity: gran },
    recovery: {
      flagged_leads: new Set(flagged.map((f) => f.lead_id)).size,
      flagged_events: flagged.length,
      open_flags: openFlags?.n || 0,
      open_flagged_leads: openFlags?.leads || 0,
      recovered_leads: metrics.recovered_leads,
      recovered_converted: recoveredConverted,
      recovery_rate: metrics.recovered_leads ? Math.round((metrics.recovered_leads / Math.max(1, new Set(flagged.map((f) => f.lead_id)).size)) * 1000) / 10 : 0,
    },
    metrics,
    series,
    sources,
    status_breakdown: statusBreakdown,
    followup_effectiveness: {
      total: followupStats.length,
      completed: completed.length,
      pending: followupStats.filter((f) => f.status === "pending").length,
      on_time_rate: completed.length ? Math.round((onTime.length / completed.length) * 100) : null,
      response_rate: completed.length ? Math.round((responded.length / completed.length) * 100) : null,
      outcomes: outcomeCounts,
    },
  };
}

export function reports(user, range, settings) {
  const scope = scopeFilter(user);
  const leads = all(`SELECT * FROM leads WHERE org_id = ?${scope.sql}`, user.orgId, ...scope.params);
  const inRange = leads.filter((l) => l.received_at >= range.fromIso && l.received_at <= range.toIso);
  const metrics = leadMetrics(inRange, { settings });

  const neglected = one(
    `SELECT COUNT(DISTINCT e.lead_id) AS n FROM recovery_events e JOIN leads l ON l.id = e.lead_id
      WHERE e.org_id = ? AND e.detected_at >= ? AND e.detected_at <= ? ${scope.sql.replace("assigned_to", "l.assigned_to")}`,
    user.orgId, range.fromIso, range.toIso, ...scope.params,
  );
  const recoveredInRange = leads.filter((l) => l.recovered_at && l.recovered_at >= range.fromIso && l.recovered_at <= range.toIso);
  const recoveredRevenue = recoveredInRange.reduce((sum, l) => sum + Number(l.recovered_value ?? l.deal_value ?? 0), 0);

  const users = all("SELECT id, name, role FROM users WHERE org_id = ?", user.orgId);
  const followups = all(
    `SELECT * FROM followups WHERE org_id = ? AND due_at >= ? AND due_at <= ?`,
    user.orgId, range.fromIso, range.toIso,
  );
  const interactions = all(
    `SELECT * FROM interactions WHERE org_id = ? AND created_at >= ? AND created_at <= ?`,
    user.orgId, range.fromIso, range.toIso,
  );

  const employeeStats = users
    .filter((u) => canSeeAllLeads(user) || u.id === user.id)
    .map((u) => {
      const assigned = inRange.filter((l) => l.assigned_to === u.id);
      const converted = assigned.filter((l) => l.status === "converted");
      const responses = assigned.filter((l) => l.first_response_at).map((l) => (new Date(l.first_response_at) - new Date(l.received_at)) / 3600_000);
      const fus = followups.filter((f) => f.assigned_to === u.id);
      const fusDone = fus.filter((f) => f.status === "completed");
      const onTime = fusDone.filter((f) => new Date(f.completed_at) <= new Date(f.due_at));
      return {
        id: u.id,
        name: u.name,
        role: u.role,
        leads: assigned.length,
        contacted: assigned.filter((l) => l.first_response_at || l.last_contact_at).length,
        converted: converted.length,
        conversion_rate: assigned.length ? Math.round((converted.length / assigned.length) * 1000) / 10 : 0,
        revenue: Math.round(converted.reduce((s, l) => s + (Number(l.deal_value) || 0), 0) * 100) / 100,
        recovered: assigned.filter((l) => l.recovered_at).length,
        followups_due: fus.length,
        followups_completed: fusDone.length,
        on_time_rate: fusDone.length ? Math.round((onTime.length / fusDone.length) * 100) : null,
        interactions: interactions.filter((i) => i.user_id === u.id).length,
        avg_response_hours: responses.length ? Math.round((responses.reduce((a, b) => a + b, 0) / responses.length) * 10) / 10 : null,
      };
    })
    .sort((a, b) => b.converted - a.converted || b.revenue - a.revenue);

  const sourceMap = new Map();
  for (const l of inRange) {
    const key = l.source || "Unattributed";
    const e = sourceMap.get(key) || { source: key, leads: 0, contacted: 0, converted: 0, lost: 0, revenue: 0, recovered: 0, responseHours: [] };
    e.leads += 1;
    if (l.first_response_at) {
      e.contacted += 1;
      e.responseHours.push((new Date(l.first_response_at) - new Date(l.received_at)) / 3600_000);
    }
    if (l.status === "converted") { e.converted += 1; e.revenue += Number(l.deal_value) || 0; }
    if (l.status === "lost") e.lost += 1;
    if (l.recovered_at) e.recovered += 1;
    sourceMap.set(key, e);
  }
  const sourcePerformance = [...sourceMap.values()].map((e) => ({
    source: e.source,
    leads: e.leads,
    contacted: e.contacted,
    converted: e.converted,
    lost: e.lost,
    recovered: e.recovered,
    revenue: Math.round(e.revenue * 100) / 100,
    conversion_rate: e.leads ? Math.round((e.converted / e.leads) * 1000) / 10 : 0,
    avg_response_hours: e.responseHours.length ? Math.round((e.responseHours.reduce((a, b) => a + b, 0) / e.responseHours.length) * 10) / 10 : null,
  })).sort((a, b) => b.leads - a.leads);

  const lostReasons = new Map();
  for (const l of leads.filter((x) => x.status === "lost")) {
    const key = l.lost_reason?.trim() || "No reason recorded";
    lostReasons.set(key, (lostReasons.get(key) || 0) + 1);
  }

  const conversionDays = leads
    .filter((l) => l.converted_at)
    .map((l) => (new Date(l.converted_at) - new Date(l.received_at)) / MS_DAY);

  return {
    range: { from: range.fromIso, to: range.toIso },
    metrics: {
      ...metrics,
      neglected_leads: neglected?.n || 0,
      recovered_leads_in_range: recoveredInRange.length,
      recovered_revenue_in_range: Math.round(recoveredRevenue * 100) / 100,
      lost_leads: leads.filter((l) => l.status === "lost").length,
      avg_conversion_days_all: conversionDays.length
        ? Math.round((conversionDays.reduce((a, b) => a + b, 0) / conversionDays.length) * 10) / 10
        : null,
    },
    employees: employeeStats,
    sources: sourcePerformance,
    lost_reasons: [...lostReasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  };
}
