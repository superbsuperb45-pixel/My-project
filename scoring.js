/**
 * Lead priority scoring.
 *
 * The score is an internal triage signal (0–100) used to order work queues.
 * It is deliberately NOT expressed as a probability of conversion, and the UI
 * labels it as a priority score. Every point is attributable to a named factor
 * so a manager can explain why a lead sits at the top of the list.
 */

const MS_HOUR = 3600_000;

export function statusKind(statusKey, settings) {
  const status = (settings?.statuses || []).find((s) => s.key === statusKey);
  if (!status) return "open";
  return status.kind || "open";
}

export function hoursSince(iso, now = Date.now()) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, (now - t) / MS_HOUR);
}

export function scoreLead(lead, { settings, medianValue = 0, interactionCount = 0, openRecoveries = 0, now = Date.now() }) {
  const weights = settings?.scoring?.weights || { recency: 30, interest: 20, value: 20, engagement: 15, urgency: 15 };
  const kind = statusKind(lead.status, settings);
  const closed = kind === "won" || kind === "lost" || kind === "recovered";

  // 1. Recency of contact — the longer a live lead sits untouched, the more urgent.
  const anchor = lead.last_contact_at || lead.received_at;
  const idleHours = hoursSince(anchor, now) ?? 0;
  const recencyRatio = Math.min(1, idleHours / (24 * 14));
  const recencyPoints = closed ? 0 : Math.round(weights.recency * recencyRatio);

  // 2. Customer interest — expressed interest is worth more attention than a cold record.
  const interestMatrix = { new: 0.55, contacted: 0.7, interested: 1, follow_up: 0.85, overdue: 0.9, recovered: 0.25, converted: 0, lost: 0 };
  const interestRatio = interestMatrix[lead.status] ?? 0.5;
  const interestPoints = Math.round(weights.interest * interestRatio);

  // 3. Deal value relative to the business's typical deal.
  let valueRatio = 0;
  if (medianValue > 0 && lead.deal_value > 0) valueRatio = Math.min(1, lead.deal_value / (medianValue * 2));
  else if (lead.deal_value > 0) valueRatio = Math.min(1, lead.deal_value / 10000);
  const valuePoints = closed ? 0 : Math.round(weights.value * valueRatio);

  // 4. Engagement history — leads that were worked repeatedly but never closed deserve triage.
  const engagementRatio = Math.min(1, (interactionCount + openRecoveries) / 5);
  const engagementPoints = closed ? 0 : Math.round(weights.engagement * engagementRatio);

  // 5. Follow-up urgency — overdue beats due-today beats scheduled-later.
  const followHours = lead.follow_up_at ? (new Date(lead.follow_up_at).getTime() - now) / MS_HOUR : null;
  let urgencyRatio = 0;
  let urgencyReason = "No follow-up scheduled.";
  if (followHours != null && !Number.isNaN(followHours)) {
    if (followHours < 0) {
      urgencyRatio = 1;
      urgencyReason = `Follow-up is ${Math.round(Math.abs(followHours))}h overdue.`;
    } else if (followHours <= 24) {
      urgencyRatio = 0.7;
      urgencyReason = `Follow-up is due in ${Math.round(followHours)}h.`;
    } else if (followHours <= 72) {
      urgencyRatio = 0.4;
      urgencyReason = "Follow-up scheduled within three days.";
    } else {
      urgencyRatio = 0.15;
      urgencyReason = "Follow-up scheduled further out.";
    }
  }
  const urgencyPoints = closed ? 0 : Math.round(weights.urgency * urgencyRatio);

  const factors = [
    {
      key: "recency",
      label: "Time since last contact",
      points: recencyPoints,
      max: weights.recency,
      reason: idleHours >= 48
        ? `${Math.floor(idleHours / 24)} days since the last logged contact.`
        : `${Math.round(idleHours)} hours since the last logged contact.`,
    },
    {
      key: "interest",
      label: "Customer interest",
      points: interestPoints,
      max: weights.interest,
      reason: `Status "${lead.status}" signals ${interestRatio >= 0.85 ? "strong" : interestRatio >= 0.6 ? "moderate" : "low"} intent.`,
    },
    {
      key: "value",
      label: "Potential deal value",
      points: valuePoints,
      max: weights.value,
      reason: lead.deal_value > 0
        ? `Deal value ${lead.deal_value.toFixed(2)} against a business median of ${medianValue.toFixed(2)}.`
        : "No deal value recorded.",
    },
    {
      key: "engagement",
      label: "Interaction history",
      points: engagementPoints,
      max: weights.engagement,
      reason: `${interactionCount} logged interaction${interactionCount === 1 ? "" : "s"}${openRecoveries ? `, ${openRecoveries} open recovery flag${openRecoveries === 1 ? "" : "s"}` : ""}.`,
    },
    { key: "urgency", label: "Follow-up urgency", points: urgencyPoints, max: weights.urgency, reason: urgencyReason },
  ];

  const score = Math.max(0, Math.min(100, factors.reduce((sum, f) => sum + f.points, 0)));
  return {
    score,
    band: score >= 80 ? "critical" : score >= 60 ? "high" : score >= 40 ? "medium" : "low",
    bandLabel: score >= 80 ? "Critical" : score >= 60 ? "High" : score >= 40 ? "Medium" : "Low",
    factors,
    disclaimer: "Priority score for triage only — not a probability that the customer will buy.",
  };
}

export function medianDealValue(leads) {
  const values = leads.map((l) => Number(l.deal_value) || 0).filter((v) => v > 0).sort((a, b) => a - b);
  if (!values.length) return 0;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}
