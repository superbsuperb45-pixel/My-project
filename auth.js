import { api, esc, icons, toast } from "./view-helpers.js";

function shell(inner, asideTitle, asideText) {
  return `
    <div class="auth-wrap">
      <aside class="auth-aside">
        <a class="sidebar-brand" href="/" style="color:#fff;font-weight:700;display:flex;gap:9px;align-items:center;text-decoration:none">
          <span class="brand-mark" aria-hidden="true">LR</span> LeadRescue
        </a>
        <div>
          <h2>${esc(asideTitle)}</h2>
          <p>${esc(asideText)}</p>
          <ul>
            <li>${icons.check}<span>Recovery rules flag neglected leads automatically</span></li>
            <li>${icons.check}<span>Follow-ups with owners, dates and outcomes</span></li>
            <li>${icons.check}<span>Recovered revenue reported separately from new pipeline</span></li>
            <li>${icons.check}<span>No subscription and no payment details</span></li>
          </ul>
        </div>
        <p class="tiny" style="color:#7d8ea6;margin:0">Stop losing customers you already paid to acquire.</p>
      </aside>
      <main class="auth-main">
        <div class="auth-card">${inner}</div>
      </main>
    </div>`;
}

function bindForm(form, submit) {
  const errorBox = form.querySelector("[data-form-error]");
  const button = form.querySelector("button[type=submit]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (errorBox) { errorBox.hidden = true; errorBox.textContent = ""; }
    const data = Object.fromEntries(new FormData(form).entries());
    button.disabled = true;
    const original = button.innerHTML;
    button.innerHTML = `<span class="spinner"></span> Working…`;
    try {
      await submit(data);
    } catch (err) {
      if (errorBox) { errorBox.hidden = false; errorBox.textContent = err.message; }
      button.disabled = false;
      button.innerHTML = original;
    }
  });
}

function loginView(ctx) {
  const inner = `
    <h1>Sign in</h1>
    <p>Enter your business workspace to work the recovery queue.</p>
    <form novalidate>
      <div class="form-error" data-form-error hidden></div>
      <div class="field"><label for="email">Work email</label><input id="email" name="email" type="email" autocomplete="username" required /></div>
      <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required /></div>
      <button class="btn btn-primary btn-block" type="submit" style="margin-top:16px">Sign in</button>
    </form>
    <p class="auth-switch">New to LeadRescue? <a href="/signup">Create a workspace</a></p>
    <p class="auth-foot">Protected by server-side sessions. Contact your administrator if you need a password reset.</p>`;
  const root = document.createElement("div");
  root.innerHTML = shell(inner, "Your recovery queue is waiting.", "Sign in to see which customer inquiries need attention today, and who owns each one.");
  const form = root.querySelector("form");
  bindForm(form, async (data) => {
    await api("/api/auth/login", { method: "POST", body: { email: data.email, password: data.password } });
    window.location.href = "/app";
  });
  return root;
}

function signupView(ctx) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const currencies = ["USD", "EUR", "GBP", "CAD", "AUD", "AED", "INR", "NGN", "ZAR", "PKR", "BRL", "MXN", "SGD", "JPY"];
  const industries = ["Real estate", "Car dealership", "Marketing agency", "Consulting", "Repair & home services", "Sales team", "Other"];
  const inner = `
    <h1>Create your workspace</h1>
    <p>Set up a business account. No subscription, no payment details.</p>
    <form novalidate>
      <div class="form-error" data-form-error hidden></div>
      <div class="field"><label for="org_name">Business name</label><input id="org_name" name="org_name" required maxlength="120" autocomplete="organization" /></div>
      <div class="form-grid">
        <div class="field"><label for="name">Your name</label><input id="name" name="name" required maxlength="120" autocomplete="name" /></div>
        <div class="field"><label for="industry">Industry</label><select id="industry" name="industry">${industries.map((i) => `<option>${esc(i)}</option>`).join("")}</select></div>
      </div>
      <div class="field" style="margin-top:12px"><label for="email">Work email</label><input id="email" name="email" type="email" required autocomplete="username" /></div>
      <div class="form-grid" style="margin-top:12px">
        <div class="field"><label for="currency">Currency</label><select id="currency" name="currency">${currencies.map((c) => `<option ${c === "USD" ? "selected" : ""}>${c}</option>`).join("")}</select></div>
        <div class="field"><label for="timezone">Time zone</label><input id="timezone" name="timezone" value="${esc(timezone)}" maxlength="64" /></div>
      </div>
      <div class="field" style="margin-top:12px"><label for="password">Password</label><input id="password" name="password" type="password" required autocomplete="new-password" minlength="10" /><span class="help">At least 10 characters, including letters and numbers.</span></div>
      <button class="btn btn-primary btn-block" type="submit" style="margin-top:16px">Create workspace</button>
    </form>
    <p class="auth-switch">Already have a workspace? <a href="/login">Sign in</a></p>
    <p class="auth-foot">Your leads, notes and reports are isolated to your business. Every member of your team sees only what their role allows.</p>`;
  const root = document.createElement("div");
  root.innerHTML = shell(inner, "Start recovering the leads you already paid for.", "Create a workspace, import your existing leads and let the recovery engine show you what has been quietly expiring.");
  const form = root.querySelector("form");
  bindForm(form, async (data) => {
    await api("/api/auth/signup", { method: "POST", body: data });
    window.location.href = "/app?welcome=1";
  });
  return root;
}

async function inviteView(ctx) {
  const token = ctx.path.split("/invite/")[1] || "";
  let invite = null;
  let error = "";
  try {
    const data = await api(`/api/auth/invite/${encodeURIComponent(token)}`);
    invite = data.invite;
  } catch (err) {
    error = err.message;
  }
  const inner = error
    ? `<h1>Invitation unavailable</h1><p>${esc(error)}</p><a class="btn btn-primary btn-block" href="/login">Go to sign in</a>`
    : `
    <h1>Join ${esc(invite.organization)}</h1>
    <p>You have been invited as <strong>${esc(invite.role)}</strong> for <strong>${esc(invite.email)}</strong>.</p>
    <form novalidate>
      <div class="form-error" data-form-error hidden></div>
      <div class="field"><label for="name">Your name</label><input id="name" name="name" required value="${esc(invite.name || "")}" maxlength="120" /></div>
      <div class="field" style="margin-top:12px"><label for="password">Choose a password</label><input id="password" name="password" type="password" required minlength="10" autocomplete="new-password" /><span class="help">At least 10 characters, including letters and numbers.</span></div>
      <button class="btn btn-primary btn-block" type="submit" style="margin-top:16px">Accept invitation</button>
    </form>`;
  const root = document.createElement("div");
  root.innerHTML = shell(inner, "Join your team's recovery workspace.", "Employees see only their assigned leads. Managers and administrators see the whole book.");
  if (!error) {
    const form = root.querySelector("form");
    bindForm(form, async (data) => {
      await api(`/api/auth/invite/${encodeURIComponent(token)}/accept`, { method: "POST", body: data });
      window.location.href = "/app";
    });
  }
  return root;
}

export async function renderAuth(app, ctx) {
  app.innerHTML = "";
  const view = ctx.path === "/signup" ? signupView(ctx) : ctx.path.startsWith("/invite/") ? await inviteView(ctx) : loginView(ctx);
  app.appendChild(view);
  const input = app.querySelector("input");
  if (input) input.focus();
}
