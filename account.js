import { api, esc, icons, toast, state, refreshSession, dateShort, money, number } from "./view-helpers.js";

export async function render(root, ctx) {
  const me = ctx.state;
  root.innerHTML = `
    <div class="page-head">
      <div class="titles">
        <h1>Your account</h1>
        <p>Profile, password and workspace summary.</p>
      </div>
    </div>

    <div class="grid-2" style="align-items:start">
      <section class="card card-pad">
        <div class="stack-row" style="gap:12px;margin-bottom:14px">
          <span class="avatar lg">${esc((me.user.name || "?").slice(0, 1).toUpperCase())}</span>
          <div><strong>${esc(me.user.name)}</strong><div class="small muted">${esc(me.user.email)} · ${esc(me.user.role)}</div></div>
        </div>
        <form data-profile class="stack">
          <div class="field"><label for="ac-name">Display name</label><input id="ac-name" name="name" value="${esc(me.user.name)}" maxlength="120" required /></div>
          <button class="btn btn-primary btn-sm" type="submit" style="justify-self:start">Save name</button>
        </form>
        <div class="divider"></div>
        <form data-password class="stack">
          <div class="form-error" data-pw-error hidden></div>
          <div class="field"><label for="ac-current">Current password</label><input id="ac-current" name="current_password" type="password" autocomplete="current-password" required /></div>
          <div class="field"><label for="ac-new">New password</label><input id="ac-new" name="new_password" type="password" autocomplete="new-password" minlength="10" required />
            <span class="help">At least 10 characters with letters and numbers. Other sessions are signed out.</span></div>
          <button class="btn btn-ghost btn-sm" type="submit" style="justify-self:start">Change password</button>
        </form>
      </section>

      <div class="stack">
        <section class="card card-pad">
          <h2 style="font-size:.95rem;margin-bottom:10px">Workspace</h2>
          <dl class="kv">
            <dt>Business</dt><dd>${esc(me.org.name)}</dd>
            <dt>Industry</dt><dd>${esc(me.org.industry || "—")}</dd>
            <dt>Currency</dt><dd>${esc(me.org.currency)}</dd>
            <dt>Time zone</dt><dd>${esc(me.org.timezone)}</dd>
            <dt>Your role</dt><dd style="text-transform:capitalize">${esc(me.user.role)}</dd>
            <dt>Created</dt><dd>${dateShort(me.org.created_at)}</dd>
          </dl>
        </section>
        <section class="card card-pad">
          <h2 style="font-size:.95rem;margin-bottom:10px">Session</h2>
          <p class="small muted">You are signed in with a server-side session cookie. Signing out invalidates it immediately.</p>
          <button class="btn btn-danger btn-sm" type="button" data-logout>Sign out</button>
        </section>
      </div>
    </div>`;

  root.querySelector("[data-profile]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = new FormData(event.target).get("name");
    try {
      await api("/api/auth/me", { method: "PATCH", body: { name } });
      await refreshSession();
      toast("Name updated.", "success");
      location.reload();
    } catch (err) { toast(err.message, "error"); }
  });

  root.querySelector("[data-password]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = Object.fromEntries(new FormData(event.target).entries());
    const errBox = root.querySelector("[data-pw-error]");
    try {
      await api("/api/auth/change-password", { method: "POST", body: fd });
      toast("Password changed. Other sessions were signed out.", "success");
      event.target.reset();
    } catch (err) {
      errBox.hidden = false;
      errBox.textContent = err.message;
    }
  });

  root.querySelector("[data-logout]").addEventListener("click", async () => {
    try { await api("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    window.location.href = "/login";
  });

  return { title: "Your account" };
}
