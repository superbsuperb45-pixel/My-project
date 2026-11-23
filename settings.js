import { all, DEFAULT_SETTINGS, getSettings, logActivity, nowIso, one, run, tx } from "../db.js";
import { bad, conflict } from "../http.js";
import * as v from "../services/validate.js";
import { providerStatus } from "../config.js";

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "AED", "INR", "NGN", "ZAR", "PKR", "BRL", "MXN", "SGD", "JPY"];
const KINDS = ["open", "recovered", "won", "lost"];

function validateStatuses(input, orgId) {
  if (!Array.isArray(input) || input.length < 3) throw bad("Keep at least three lead statuses.");
  if (input.length > 30) throw bad("A maximum of 30 statuses is supported.");
  const seen = new Set();
  const cleaned = input.map((raw) => {
    const key = v.str(raw?.key, "Status key", { required: true, max: 40 }).toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(key)) throw bad(`Status key "${key}" must start with a letter and use only letters, numbers and underscores.`);
    if (seen.has(key)) throw conflict(`Duplicate status key "${key}".`, "DUPLICATE_STATUS");
    seen.add(key);
    const label = v.str(raw?.label, "Status label", { required: true, max: 60 });
    const kind = v.pickEnum(raw?.kind, KINDS, "Status behaviour", "open");
    const color = v.str(raw?.color || "#64748b", "Status colour", { max: 20 });
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw bad(`Status colour for "${label}" must be a hex value like #2563eb.`);
    return { key, label, kind, color };
  });
  if (!cleaned.some((s) => s.kind === "won")) throw bad("One status must behave as the converted/won status.");
  if (!cleaned.some((s) => s.kind === "lost")) throw bad("One status must behave as the lost status.");
  // Statuses in use cannot disappear from the configuration.
  const inUse = all("SELECT status, COUNT(*) AS n FROM leads WHERE org_id = ? GROUP BY status", orgId);
  for (const row of inUse) {
    if (!seen.has(row.status)) throw conflict(`Status "${row.status}" is used by ${row.n} lead(s). Move those leads before removing it.`, "STATUS_IN_USE");
  }
  return cleaned;
}

export const settingsRoutes = [
  {
    method: "GET", path: "/api/settings", capability: "settings:manage",
    handler({ org, settings }) {
      return {
        organization: {
          id: org.id, name: org.name, industry: org.industry, currency: org.currency,
          timezone: org.timezone, phone: org.phone, website: org.website, created_at: org.created_at,
        },
        settings,
        defaults: DEFAULT_SETTINGS,
        providers: providerStatus(),
        currencies: CURRENCIES,
        timezones: Intl.supportedValuesOf ? Intl.supportedValuesOf("timeZone") : [org.timezone],
      };
    },
  },
  {
    method: "PATCH", path: "/api/settings", capability: "settings:manage",
    handler({ user, org, body, settings }) {
      const business = body.business || {};
      const name = business.name === undefined ? org.name : v.str(business.name, "Business name", { required: true, max: 120 });
      const industry = business.industry === undefined ? org.industry : v.str(business.industry, "Industry", { max: 80 });
      const currency = business.currency === undefined ? org.currency : v.pickEnum(business.currency, CURRENCIES, "Currency");
      const timezone = business.timezone === undefined ? org.timezone : v.str(business.timezone, "Time zone", { max: 64, required: true });
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: timezone });
      } catch {
        throw bad("That time zone is not recognised.");
      }
      const phone = business.phone === undefined ? org.phone : v.str(business.phone, "Business phone", { max: 40 });
      const website = business.website === undefined ? org.website : v.str(business.website, "Website", { max: 200 });

      const next = { ...settings };

      if (body.statuses !== undefined) next.statuses = validateStatuses(body.statuses, org.id);
      if (body.sources !== undefined) {
        if (!Array.isArray(body.sources) || body.sources.length > 40) throw bad("Lead sources must be a list of up to 40 names.");
        const sources = [];
        for (const s of body.sources) {
          const name = v.str(s, "Lead source", { max: 80 });
          if (name && !sources.includes(name)) sources.push(name);
        }
        next.sources = sources;
      }
      if (body.recovery !== undefined) {
        const r = body.recovery;
        next.recovery = {
          ...settings.recovery,
          no_response_hours: v.range(r.no_response_hours ?? settings.recovery.no_response_hours, { min: 1, max: 720, fallback: settings.recovery.no_response_hours }),
          no_contact_days: v.range(r.no_contact_days ?? settings.recovery.no_contact_days, { min: 1, max: 365, fallback: settings.recovery.no_contact_days }),
          stalled_interest_days: v.range(r.stalled_interest_days ?? settings.recovery.stalled_interest_days, { min: 1, max: 365, fallback: settings.recovery.stalled_interest_days }),
          inactive_days: v.range(r.inactive_days ?? settings.recovery.inactive_days, { min: 1, max: 365, fallback: settings.recovery.inactive_days }),
          auto_overdue: r.auto_overdue === undefined ? settings.recovery.auto_overdue : Boolean(r.auto_overdue),
          overdue_status_key: v.str(r.overdue_status_key ?? settings.recovery.overdue_status_key, "Overdue status", { max: 40 }) || "overdue",
        };
        if (!next.statuses.some((s) => s.key === next.recovery.overdue_status_key)) {
          throw bad("The automatic overdue status must exist in your status list.");
        }
      }
      if (body.scoring !== undefined) {
        const weights = body.scoring.weights || {};
        const nextWeights = {};
        for (const key of ["recency", "interest", "value", "engagement", "urgency"]) {
          nextWeights[key] = v.range(weights[key] ?? settings.scoring.weights[key], { min: 0, max: 100, fallback: settings.scoring.weights[key] });
        }
        const sum = Object.values(nextWeights).reduce((a, b) => a + b, 0);
        if (sum < 10 || sum > 200) throw bad("Scoring weights must add up to between 10 and 200 points.");
        next.scoring = { ...settings.scoring, weights: nextWeights };
      }
      if (body.followup !== undefined) {
        const f = body.followup;
        next.followup = {
          ...settings.followup,
          default_interval_days: v.range(f.default_interval_days ?? settings.followup.default_interval_days, { min: 1, max: 90, fallback: settings.followup.default_interval_days }),
          reminder_lead_hours: v.range(f.reminder_lead_hours ?? settings.followup.reminder_lead_hours, { min: 0, max: 168, fallback: settings.followup.reminder_lead_hours }),
          daily_digest: f.daily_digest === undefined ? settings.followup.daily_digest : Boolean(f.daily_digest),
          overdue_alert: f.overdue_alert === undefined ? settings.followup.overdue_alert : Boolean(f.overdue_alert),
        };
      }
      if (body.notifications !== undefined) {
        const n = body.notifications;
        next.notifications = {
          in_app: n.in_app === undefined ? settings.notifications.in_app : Boolean(n.in_app),
          email_digest: n.email_digest === undefined ? settings.notifications.email_digest : Boolean(n.email_digest),
          overdue_alerts: n.overdue_alerts === undefined ? settings.notifications.overdue_alerts : Boolean(n.overdue_alerts),
        };
      }

      tx(() => {
        run(
          "UPDATE organizations SET name=?, industry=?, currency=?, timezone=?, phone=?, website=?, settings=? WHERE id=?",
          name, industry, currency, timezone, phone, website, JSON.stringify(next), org.id,
        );
        logActivity(org.id, user, "settings.updated", "organization", org.id, "Business settings updated");
      });
      const fresh = one("SELECT * FROM organizations WHERE id = ?", org.id);
      return {
        organization: { id: fresh.id, name: fresh.name, industry: fresh.industry, currency: fresh.currency, timezone: fresh.timezone, phone: fresh.phone, website: fresh.website },
        settings: getSettings(fresh),
      };
    },
  },
];
