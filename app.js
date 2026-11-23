import { $, esc, icons, initials, openModal, toast } from "./ui.js";

export const state = {
  user: null,
  org: null,
  settings: null,
  team: [],
  providers: null,
  capabilities: [],
  sidebarOpen: false,
};

export async function api(path, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(path, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data?.error?.code || "ERROR";
    err.details = data?.error?.details;
    if (res.status === 401 && !path.endsWith("/api/auth/me")) {
      window.location.href = "/login";
    }
    throw err;
  }
  return data;
}

export function can(capability) {
  return state.capabilities.includes(capability);
}

export function navigate(path, { replace = false } = {}) {
  if (replace) history.replaceState({}, "", path);
  else history.pushState({}, "", path);
  route();
}

const ROUTES = [
  { pattern: /^\/app\/?$/, view: "dashboard", title: "Dashboard", nav: "dashboard" },
  { pattern: /^\/app\/leads\/?$/, view: "leads", title: "Leads", nav: "leads" },
  { pattern: /^\/app\/recovery\/?$/, view: "recovery", title: "Recovery queue", nav: "recovery" },
  { pattern: /^\/app\/followups\/?$/, view: "followups", title: "Follow-ups", nav: "followups" },
  { pattern: /^\/app\/communications\/?$/, view: "comms", title: "Communication center", nav: "comms" },
  { pattern: /^\/app\/reports\/?$/, view: "reports", title: "Reports", nav: "reports" },
  { pattern: /^\/app\/team\/?$/, view: "team", title: "Team", nav: "team" },
  { pattern: /^\/app\/settings\/?$/, view: "settings", title: "Settings", nav: "settings" },
  { pattern: /^\/app\/account\/?$/, view: "account", title: "Your account", nav: null },
];

const VIEW_MODULES = {
  dashboard: () => import("./views/dashboard.js"),
  leads: () => import("./views/leads.js"),
  recovery: () => import("./views/recovery.js"),
  followups: () => import("./views/followups.js"),
  comms: () => import("./views/comms.js"),
  reports: () => import("./views/reports.js"),
  team: () => import("./views/team.js"),
  settings: () => import("./views/settings.js"),
  account: () => import("./views/account.js"),
  auth: () => import("./views/auth.js"),
};

const NAV = [
  { key: "dashboard", label: "Dashboard", href: "/app", icon: "dashboard", cap: "reports:read_own" },
  { key: "leads", label: "Leads", href: "/app/leads", icon: "leads", cap: "lead:read_own" },
  { key: "recovery", label: "Recovery queue", href: "/app/recovery", icon: "recovery", cap: "recovery:read", count: "recovery" },
  { key: "followups", label: "Follow-ups", href: "/app/followups", icon: "followups", cap: "followup:read_own", count: "followups" },
  { key: "comms", label: "Communication", href: "/app/communications", icon: "comms", cap: "comms:send" },
  { key: "reports", label: "Reports", href: "/app/reports", icon: "reports", cap: "reports:read_own" },
];
const NAV_ADMIN = [
  { key: "team", label: "Team", href: "/app/team", icon: "team", cap: "team:read" },
  { key: "settings", label: "Settings", href: "/app/settings", icon: "settings", cap: "settings:manage" },
];

let shellBuilt = false;
let currentView = null;
let counts = { recovery: 0, followups: 0 };

export function refreshCounts() {
  if (!state.user) return;
  api("/api/recovery").then((data) => {
    counts.recovery = data.counts?.flagged_leads || 0;
    updateCountBadges();
  }).catch(() => {});
  api("/api/followups?due=overdue").then((data) => {
    counts.followups = data.counts?.overdue || 0;
    updateCountBadges();
  }).catch(() => {});
}

function updateCountBadges() {
  const map = { recovery: counts.recovery, followups: counts.followups };
  document.querySelectorAll("[data-nav-count]").forEach((el) => {
    const key = el.getAttribute("data-nav-count");
    const value = map[key] || 0;
    el.textContent = value > 99 ? "99+" : String(value);
    el.hidden = !value;
    el.classList.toggle("alert", key === "followups" && value > 0);
  });
  const bell = document.querySelector("[data-bell-count]");
  const total = counts.recovery + counts.followups;
  if (bell) { bell.textContent = total > 99 ? "99+" : String(total); bell.hidden = !total; }
}

function buildShell(title, navKey) {
  const app = document.getElementById("app");
  app.hidden = false;
  if (shellBuilt) {
    document.querySelectorAll("[data-nav]").forEach((el) => {
      el.classList.toggle("active", el.getAttribute("data-nav") === navKey);
    });
    const h1 = document.querySelector("[data-page-title]");
    if (h1) h1.textContent = title;
    return document.querySelector("[data-view-root]");
  }
  const navLinks = (items) => items.filter((item) => can(item.cap)).map((item) => `
    <a class="side-link" href="${item.href}" data-nav="${item.key}">
      ${icons[item.icon]}<span>${esc(item.label)}</span>
      ${item.count ? `<span class="count" data-nav-count="${item.count}" hidden></span>` : ""}
    </a>`).join("");

  app.innerHTML = `
    <div class="shell">
      <div class="sidebar-scrim" data-sidebar-scrim hidden></div>
      <aside class="sidebar" data-sidebar aria-label="Workspace navigation">
        <div class="sidebar-head">
          <a class="sidebar-brand" href="/app"><span class="brand-mark" aria-hidden="true">LR</span>LeadRescue</a>
        </div>
        <div class="org-switch">
          <span class="org-name">${esc(state.org?.name || "Your business")}</span>
          <span class="org-meta">${esc(state.org?.currency || "USD")} · ${esc(state.org?.timezone || "UTC")}</span>
        </div>
        <nav class="side-nav">
          <div class="side-label">Workspace</div>
          ${navLinks(NAV)}
          <div class="side-label">Business</div>
          ${navLinks(NAV_ADMIN)}
          <a class="side-link" href="/app/account" data-nav="account">${icons.settings}<span>Your account</span></a>
        </nav>
        <div class="sidebar-foot">
          <button class="user-chip" type="button" data-user-menu aria-haspopup="menu">
            <span class="avatar">${esc(initials(state.user?.name))}</span>
            <span class="who"><strong>${esc(state.user?.name || "")}</strong><span>${esc(state.user?.role || "")}</span></span>
          </button>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="icon-btn menu-toggle" type="button" data-menu-toggle aria-label="Open navigation">${icons.menu}</button>
          <div>
            <h1 data-page-title>${esc(title)}</h1>
          </div>
          <div class="topbar-actions">
            <button class="icon-btn" type="button" data-notifications aria-label="Notifications">
              ${icons.bell}<span class="dot-badge" data-bell-count hidden></span>
            </button>
            <a class="btn btn-primary btn-sm" href="/app/leads?new=1">${icons.plus} New lead</a>
          </div>
        </header>
        <main class="content" data-view-root></main>
      </div>
    </div>`;

  shellBuilt = true;
  document.querySelectorAll("[data-menu-toggle]").forEach((btn) => btn.addEventListener("click", () => {
    const sidebar = document.querySelector("[data-sidebar]");
    const scrim = document.querySelector("[data-sidebar-scrim]");
    const open = sidebar.classList.toggle("open");
    scrim.hidden = !open;
  }));
  document.querySelector("[data-sidebar-scrim]")?.addEventListener("click", () => {
    document.querySelector("[data-sidebar]").classList.remove("open");
    document.querySelector("[data-sidebar-scrim]").hidden = true;
  });
  document.querySelector("[data-user-menu]")?.addEventListener("click", () => openAccountMenu());
  document.querySelector("[data-notifications]")?.addEventListener("click", () => openNotifications());
  const active = document.querySelector(`[data-nav="${navKey}"]`);
  if (active) active.classList.add("active");
  return document.querySelector("[data-view-root]");
}

function openAccountMenu() {
  openModal({
    title: "Workspace account",
    body: `
      <div class="stack-row" style="gap:12px;margin-bottom:14px">
        <span class="avatar lg">${esc(initials(state.user?.name))}</span>
        <div><strong>${esc(state.user?.name)}</strong><div class="small muted">${esc(state.user?.email)} · ${esc(state.user?.role)}</div></div>
      </div>
      <div class="small muted">${esc(state.org?.name || "")} · ${esc(state.org?.currency || "")} · ${esc(state.org?.timezone || "")}</div>
      <div class="divider"></div>
      <div class="stack" style="gap:8px">
        <a class="btn btn-ghost btn-block" href="/app/account">Account settings</a>
        ${can("settings:manage") ? '<a class="btn btn-ghost btn-block" href="/app/settings">Business settings</a>' : ""}
        <button class="btn btn-danger btn-block" type="button" data-logout>Sign out</button>
      </div>`,
    onMount(wrap) {
      wrap.querySelector("[data-logout]").addEventListener("click", async () => {
        try { await api("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
        window.location.href = "/login";
      });
    },
  });
}

function openNotifications() {
  const body = `
    <div class="stack" style="gap:10px">
      <div class="card card-pad">
        <div class="stack-row"><strong>Recovery flags open</strong><span class="badge overdue" style="margin-left:auto">${counts.recovery}</span></div>
        <p class="small muted" style="margin:6px 0 0">Leads matching your recovery rules and waiting for an action.</p>
        <a class="btn btn-ghost btn-sm" href="/app/recovery" style="margin-top:10px">Open recovery queue</a>
      </div>
      <div class="card card-pad">
        <div class="stack-row"><strong>Overdue follow-ups</strong><span class="badge overdue" style="margin-left:auto">${counts.followups}</span></div>
        <p class="small muted" style="margin:6px 0 0">Follow-ups whose due date has passed and are still pending.</p>
        <a class="btn btn-ghost btn-sm" href="/app/followups?due=overdue" style="margin-top:10px">Open follow-ups</a>
      </div>
      <p class="tiny muted">In-app notifications are derived from your live data. Email digests require an email provider configured on the server — see Settings → Integrations.</p>
    </div>`;
  openModal({ title: "Notifications", body });
}

async function loadSession() {
  const data = await api("/api/auth/me");
  state.user = data.user;
  state.org = data.organization;
  state.settings = data.organization.settings;
  state.team = data.team;
  state.providers = data.providers;
  state.capabilities = data.capabilities;
  return data;
}

export async function refreshSession() {
  const data = await loadSession();
  return data;
}

export async function route() {
  const path = window.location.pathname;
  const app = document.getElementById("app");

  // auth pages
  if (path === "/login" || path === "/signup" || path.startsWith("/invite/")) {
    try {
      const me = await api("/api/auth/me");
      if (me?.user) { window.location.href = "/app"; return; }
    } catch { /* not signed in — expected */ }
    if (currentView?.destroy) currentView.destroy();
    shellBuilt = false;
    document.getElementById("boot").hidden = true;
    app.hidden = false;
    const mod = await VIEW_MODULES.auth();
    await mod.renderAuth(app, { path, state, api, navigate });
    return;
  }

  if (!path.startsWith("/app")) {
    window.location.href = "/";
    return;
  }

  try {
    if (!state.user) await loadSession();
  } catch (err) {
    if (err.status === 401) { window.location.href = "/login"; return; }
    document.getElementById("boot").hidden = true;
    app.hidden = false;
    app.innerHTML = `<div class="empty" style="padding-top:80px"><h3>Could not load your workspace</h3><p>${esc(err.message)}</p><button class="btn btn-primary" onclick="location.reload()">Retry</button></div>`;
    return;
  }

  const match = ROUTES.find((r) => r.pattern.test(path));
  const routeDef = match || ROUTES[0];
  const root = buildShell(routeDef.title, routeDef.nav);
  root.innerHTML = `<div class="stack"><div class="skeleton" style="height:96px"></div><div class="skeleton" style="height:280px"></div></div>`;
  document.getElementById("boot").hidden = true;

  if (currentView?.destroy) {
    try { currentView.destroy(); } catch { /* ignore */ }
  }

  try {
    const mod = await VIEW_MODULES[routeDef.view]();
    const result = await mod.render(root, {
      state, api, navigate, refreshSession, refreshCounts,
      query: new URLSearchParams(window.location.search),
    });
    currentView = result || null;
    if (result?.title) {
      const h1 = document.querySelector("[data-page-title]");
      if (h1) h1.textContent = result.title;
    }
    refreshCounts();
  } catch (err) {
    if (err.status === 401) { window.location.href = "/login"; return; }
    root.innerHTML = `<div class="card empty">
      <div class="empty-icon">${icons.alert}</div>
      <h3>${err.code === "FORBIDDEN" ? "You do not have access to this page" : "Something went wrong loading this page"}</h3>
      <p>${esc(err.message)}</p>
      <button class="btn btn-primary" type="button" data-retry>Try again</button>
    </div>`;
    root.querySelector("[data-retry]")?.addEventListener("click", () => route());
  }
}

window.addEventListener("popstate", route);
window.addEventListener("resize", () => {
  if (window.innerWidth > 980) {
    document.querySelector("[data-sidebar]")?.classList.remove("open");
    const scrim = document.querySelector("[data-sidebar-scrim]");
    if (scrim) scrim.hidden = true;
  }
});

route();
