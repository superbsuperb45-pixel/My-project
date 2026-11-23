import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new DatabaseSync(config.dbPath);

db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA busy_timeout = 5000;");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  industry TEXT DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'USD',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  phone TEXT DEFAULT '',
  website TEXT DEFAULT '',
  settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee',
  status TEXT NOT NULL DEFAULT 'active',
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS invites (
  token TEXT PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'employee',
  created_by INTEGER,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  company TEXT DEFAULT '',
  source TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  deal_value REAL NOT NULL DEFAULT 0,
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  received_at TEXT NOT NULL,
  last_contact_at TEXT,
  first_response_at TEXT,
  follow_up_at TEXT,
  notes TEXT DEFAULT '',
  lost_reason TEXT DEFAULT '',
  consent TEXT NOT NULL DEFAULT 'unknown',
  opted_out INTEGER NOT NULL DEFAULT 0,
  recovered_at TEXT,
  converted_at TEXT,
  lost_at TEXT,
  recovered_value REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by INTEGER
);
CREATE INDEX IF NOT EXISTS idx_leads_org ON leads(org_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_assignee ON leads(org_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_followup ON leads(org_id, follow_up_at);

CREATE TABLE IF NOT EXISTS interactions (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id INTEGER,
  type TEXT NOT NULL DEFAULT 'note',
  channel TEXT DEFAULT '',
  direction TEXT DEFAULT 'outbound',
  summary TEXT NOT NULL DEFAULT '',
  outcome TEXT DEFAULT 'none',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_interactions_lead ON interactions(org_id, lead_id);

CREATE TABLE IF NOT EXISTS followups (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_at TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'call',
  note TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  outcome TEXT DEFAULT 'none',
  completed_at TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_followups_org ON followups(org_id, status, due_at);

CREATE TABLE IF NOT EXISTS recovery_events (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  rule_key TEXT NOT NULL,
  rule_label TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  severity INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open',
  detected_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution TEXT DEFAULT '',
  resolved_by INTEGER,
  UNIQUE(lead_id, rule_key)
);
CREATE INDEX IF NOT EXISTS idx_recovery_org ON recovery_events(org_id, status);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  subject TEXT DEFAULT '',
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  user_id INTEGER,
  channel TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'outbound',
  to_address TEXT DEFAULT '',
  subject TEXT DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  provider TEXT DEFAULT '',
  provider_ref TEXT DEFAULT '',
  error TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_org ON messages(org_id, created_at);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id INTEGER,
  actor TEXT DEFAULT '',
  action TEXT NOT NULL,
  entity TEXT DEFAULT '',
  entity_id INTEGER,
  detail TEXT DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_org ON activity(org_id, created_at);

CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
`;

db.exec(SCHEMA);

export function nowIso() {
  return new Date().toISOString();
}

export function tx(fn) {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch { /* ignore */ }
    throw err;
  }
}

export function one(sql, ...params) {
  return db.prepare(sql).get(...params);
}

export function all(sql, ...params) {
  return db.prepare(sql).all(...params);
}

export function run(sql, ...params) {
  return db.prepare(sql).run(...params);
}

export function logActivity(orgId, user, action, entity = "", entityId = null, detail = "") {
  run(
    `INSERT INTO activity (org_id, user_id, actor, action, entity, entity_id, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    orgId, user?.id ?? null, user?.name ?? "system", action, entity, entityId, detail, nowIso(),
  );
}

export const DEFAULT_SETTINGS = {
  statuses: [
    { key: "new", label: "New", kind: "open", color: "#3b82f6" },
    { key: "contacted", label: "Contacted", kind: "open", color: "#6366f1" },
    { key: "interested", label: "Interested", kind: "open", color: "#8b5cf6" },
    { key: "follow_up", label: "Follow-up required", kind: "open", color: "#f59e0b" },
    { key: "overdue", label: "Overdue", kind: "open", color: "#ef4444" },
    { key: "recovered", label: "Recovered", kind: "recovered", color: "#14b8a6" },
    { key: "converted", label: "Converted", kind: "won", color: "#059669" },
    { key: "lost", label: "Lost", kind: "lost", color: "#94a3b8" },
  ],
  sources: ["Website", "Facebook Ads", "Google Ads", "Phone call", "Walk-in", "Referral", "Trade show", "WhatsApp"],
  recovery: {
    no_response_hours: 24,
    no_contact_days: 7,
    stalled_interest_days: 14,
    inactive_days: 21,
    auto_overdue: true,
    overdue_status_key: "overdue",
  },
  scoring: {
    weights: { recency: 30, interest: 20, value: 20, engagement: 15, urgency: 15 },
  },
  followup: {
    default_interval_days: 2,
    reminder_lead_hours: 12,
    daily_digest: true,
    overdue_alert: true,
  } ,
  notifications: {
    in_app: true,
    email_digest: false,
    overdue_alerts: true,
  },
};

export function getSettings(org) {
  let stored = {};
  try { stored = JSON.parse(org?.settings || "{}"); } catch { stored = {}; }
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    recovery: { ...DEFAULT_SETTINGS.recovery, ...(stored.recovery || {}) },
    scoring: { ...DEFAULT_SETTINGS.scoring, ...(stored.scoring || {}), weights: { ...DEFAULT_SETTINGS.scoring.weights, ...((stored.scoring || {}).weights || {}) } },
    followup: { ...DEFAULT_SETTINGS.followup, ...(stored.followup || {}) },
    notifications: { ...DEFAULT_SETTINGS.notifications, ...(stored.notifications || {}) },
    statuses: Array.isArray(stored.statuses) && stored.statuses.length ? stored.statuses : DEFAULT_SETTINGS.statuses,
    sources: Array.isArray(stored.sources) && stored.sources.length ? stored.sources : DEFAULT_SETTINGS.sources,
  };
}

export function getOrg(orgId) {
  return one("SELECT * FROM organizations WHERE id = ?", orgId);
}
