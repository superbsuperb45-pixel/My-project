import crypto from "node:crypto";
import { all, getSettings, logActivity, nowIso, one, run, tx } from "../db.js";
import {
  checkLoginThrottle, clearLoginFailures, createSession, currentUser, destroySessionByToken,
  hashPassword, normalizeEmail, passwordIssue, registerLoginFailure, requireUser, ROLES,
  verifyPassword, can, teamMembers,
} from "../auth.js";
import { AppError, bad, conflict, clientIp, clearCookie, notFound, parseCookies, unauthorized } from "../http.js";
import { config, providerStatus } from "../config.js";
import * as v from "../services/validate.js";
import { RECOVERY_RULES } from "../services/engine.js";

function orgPayload(org, settings) {
  return {
    id: org.id,
    name: org.name,
    industry: org.industry,
    currency: org.currency,
    timezone: org.timezone,
    phone: org.phone,
    website: org.website,
    created_at: org.created_at,
    settings,
  };
}

function sessionPayload(user, req) {
  const org = user.org;
  const settings = getSettings(org);
  return {
    user: {
      id: user.id, name: user.name, email: user.email, role: user.role,
      must_change_password: user.mustChangePassword,
    },
    organization: orgPayload(org, settings),
    capabilities: ["lead:read_all", "lead:write_all", "lead:read_own", "lead:write_own", "lead:delete",
      "followup:read_all", "followup:write_all", "followup:read_own", "followup:write_own",
      "recovery:read", "recovery:manage", "comms:send", "reports:read", "reports:read_own",
      "team:read", "team:manage", "settings:manage", "import:csv", "export:csv"].filter((c) => can(user, c)),
    team: teamMembers(user.orgId),
    providers: providerStatus(),
    recovery_rules: RECOVERY_RULES,
    app_url: config.appUrl,
  };
}

export const authRoutes = [
  {
    method: "GET", path: "/api/health", public: true,
    handler() {
      return {
        ok: true,
        service: "leadrescue",
        time: nowIso(),
        database: "sqlite",
        providers: providerStatus(),
      };
    },
  },
  {
    method: "POST", path: "/api/auth/signup", public: true,
    handler({ req, res, body }) {
      const orgName = v.str(body.org_name, "Business name", { required: true, max: 120 });
      const name = v.str(body.name, "Your name", { required: true, max: 120 });
      const email = v.emailAddr(body.email, "Email", { required: true });
      const password = String(body.password || "");
      const issue = passwordIssue(password);
      if (issue) throw bad(issue);
      const currency = v.pickEnum(body.currency || "USD", ["USD", "EUR", "GBP", "CAD", "AUD", "AED", "INR", "NGN", "ZAR", "PKR", "BRL", "MXN", "SGD", "JPY"], "Currency", "USD");
      const timezone = v.str(body.timezone || "UTC", "Time zone", { max: 64 }) || "UTC";
      const industry = v.str(body.industry || "", "Industry", { max: 80 });
      if (one("SELECT id FROM users WHERE email = ?", email)) throw conflict("An account with that email already exists. Sign in instead.", "EMAIL_TAKEN");
      const now = nowIso();
      const orgId = tx(() => {
        const orgRes = run(
          "INSERT INTO organizations (name, industry, currency, timezone, settings, created_at) VALUES (?,?,?,?,?,?)",
          orgName, industry, currency, timezone, "{}", now,
        );
        const orgId = Number(orgRes.lastInsertRowid);
        const userRes = run(
          "INSERT INTO users (org_id, name, email, password_hash, role, created_at) VALUES (?,?,?,?,?,?)",
          orgId, name, email, hashPassword(password), "admin", now,
        );
        const userId = Number(userRes.lastInsertRowid);
        run(
          `INSERT INTO activity (org_id, user_id, actor, action, entity, detail, created_at)
           VALUES (?,?,?,?,?,?,?)`,
          orgId, userId, name, "account.created", "organization", orgName, now,
        );
        return orgId;
      });
      const user = currentUserSetup(req, res, orgId);
      return { ...sessionPayload(user, req), created: true };
    },
  },
  {
    method: "POST", path: "/api/auth/login", public: true,
    handler({ req, res, body }) {
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");
      const throttleKey = `${clientIp(req)}:${email}`;
      checkLoginThrottle(throttleKey);
      const user = one("SELECT * FROM users WHERE email = ?", email);
      if (!user || !verifyPassword(password, user.password_hash)) {
        registerLoginFailure(throttleKey);
        throw Object.assign(unauthorized("Email or password is incorrect."), { status: 401 });
      }
      if (user.status !== "active") throw Object.assign(unauthorized("This account has been deactivated. Ask your administrator."), { status: 403 });
      clearLoginFailures(throttleKey);
      createSession(req, res, user.id);
      const org = one("SELECT * FROM organizations WHERE id = ?", user.org_id);
      logActivity(user.org_id, { id: user.id, name: user.name }, "auth.login", "user", user.id, "");
      return sessionPayload({ ...user, orgId: user.org_id, org, mustChangePassword: Boolean(user.must_change_password) }, req);
    },
  },
  {
    method: "POST", path: "/api/auth/logout", public: true,
    handler({ req, res }) {
      const token = parseCookies(req)[config.sessionCookie];
      destroySessionByToken(token);
      clearCookie(req, res, config.sessionCookie);
      return { ok: true };
    },
  },
  {
    method: "GET", path: "/api/auth/me", public: true,
    handler({ req, res }) {
      const user = currentUser(req);
      if (!user) throw unauthorized();
      return sessionPayload(user, req);
    },
  },
  {
    method: "PATCH", path: "/api/auth/me",
    handler({ user, body }) {
      const name = body.name === undefined ? user.name : v.str(body.name, "Your name", { required: true, max: 120 });
      run("UPDATE users SET name = ? WHERE id = ?", name, user.id);
      const updated = { ...user, name };
      return { user: { id: updated.id, name, email: updated.email, role: updated.role } };
    },
  },
  {
    method: "POST", path: "/api/auth/change-password",
    handler({ user, body, req, res }) {
      const current = String(body.current_password || "");
      const next = String(body.new_password || "");
      const row = one("SELECT password_hash FROM users WHERE id = ?", user.id);
      if (!verifyPassword(current, row.password_hash)) throw bad("Your current password is incorrect.");
      const issue = passwordIssue(next);
      if (issue) throw bad(issue);
      run("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?", hashPassword(next), user.id);
      run("DELETE FROM sessions WHERE user_id = ? AND token <> ?", user.id, user.sessionToken);
      logActivity(user.orgId, user, "auth.password_changed", "user", user.id, "");
      return { ok: true };
    },
  },
  {
    method: "GET", path: "/api/auth/invite/:token", public: true,
    handler({ params }) {
      const invite = one("SELECT * FROM invites WHERE token = ?", params.token);
      if (!invite) throw notFound("This invitation link is invalid.");
      if (invite.accepted_at) throw conflict("This invitation has already been accepted. Sign in instead.", "INVITE_USED");
      if (new Date(invite.expires_at).getTime() < Date.now()) throw conflict("This invitation has expired. Ask your administrator for a new one.", "INVITE_EXPIRED");
      const org = one("SELECT name FROM organizations WHERE id = ?", invite.org_id);
      return { invite: { email: invite.email, role: invite.role, name: invite.name, organization: org?.name || "", expires_at: invite.expires_at } };
    },
  },
  {
    method: "POST", path: "/api/auth/invite/:token/accept", public: true,
    handler({ req, res, params, body }) {
      const invite = one("SELECT * FROM invites WHERE token = ?", params.token);
      if (!invite) throw notFound("This invitation link is invalid.");
      if (invite.accepted_at) throw conflict("This invitation has already been accepted.", "INVITE_USED");
      if (new Date(invite.expires_at).getTime() < Date.now()) throw conflict("This invitation has expired.", "INVITE_EXPIRED");
      const name = v.str(body.name, "Your name", { required: true, max: 120 });
      const password = String(body.password || "");
      const issue = passwordIssue(password);
      if (issue) throw bad(issue);
      if (one("SELECT id FROM users WHERE email = ?", invite.email)) throw conflict("An account with that email already exists.", "EMAIL_TAKEN");
      const now = nowIso();
      const userId = tx(() => {
        const r = run(
          "INSERT INTO users (org_id, name, email, password_hash, role, created_at) VALUES (?,?,?,?,?,?)",
          invite.org_id, name, invite.email, hashPassword(password), invite.role, now,
        );
        run("UPDATE invites SET accepted_at = ? WHERE token = ?", now, invite.token);
        run(
          "INSERT INTO activity (org_id, user_id, actor, action, entity, detail, created_at) VALUES (?,?,?,?,?,?,?)",
          invite.org_id, Number(r.lastInsertRowid), name, "team.joined", "user", invite.role, now,
        );
        return Number(r.lastInsertRowid);
      });
      createSession(req, res, userId);
      const created = one("SELECT * FROM users WHERE id = ?", userId);
      const org = one("SELECT * FROM organizations WHERE id = ?", invite.org_id);
      return sessionPayload({ ...created, orgId: created.org_id, org, mustChangePassword: false }, req);
    },
  },
];

function currentUserSetup(req, res, orgId) {
  const org = one("SELECT * FROM organizations WHERE id = ?", orgId);
  const user = one("SELECT * FROM users WHERE org_id = ? AND role = 'admin' ORDER BY id LIMIT 1", orgId);
  createSession(req, res, user.id);
  return {
    id: user.id, orgId, name: user.name, email: user.email, role: user.role,
    status: user.status, mustChangePassword: false, org,
  };
}
