import { api, esc, icons, number, dateShort, relative, toast, confirmDialog, openModal, can, state } from "./view-helpers.js";

export async function render(root, ctx) {
  const data = await api("/api/team");
  const activity = await api("/api/team/activity?limit=60").catch(() => ({ activity: [] }));
  const isAdmin = can("team:manage");

  root.innerHTML = `
    <div class="page-head">
      <div class="titles">
        <h1>Team</h1>
        <p>Ownership, workload and permissions. Employees only see leads assigned to them.</p>
      </div>
      <div class="actions">
        ${isAdmin ? `<button class="btn btn-primary btn-sm" type="button" data-invite>${icons.plus} Invite team member</button>` : ""}
      </div>
    </div>

    <section class="card" style="margin-bottom:14px">
      <div class="card-head"><h2>Members</h2><span class="spacer"></span><span class="small muted">${data.members.length} member${data.members.length === 1 ? "" : "s"}</span></div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th scope="col">Member</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col" class="right">Leads</th><th scope="col" class="right">Converted</th><th scope="col" class="right">Pending follow-ups</th><th scope="col">Last sign-in</th><th scope="col"></th></tr></thead>
          <tbody>
            ${data.members.map((m) => `<tr>
              <td><div class="cell-main">${esc(m.name)}${m.id === ctx.state.user.id ? ' <span class="badge outline">you</span>' : ""}</div><div class="cell-sub">${esc(m.email)}</div></td>
              <td><span class="badge role">${esc(m.role)}</span></td>
              <td><span class="badge ${m.status === "active" ? "converted" : "lost"}">${esc(m.status)}</span></td>
              <td class="right num">${number(m.leads)}</td>
              <td class="right num">${number(m.converted)}</td>
              <td class="right num">${number(m.pending_followups)}</td>
              <td class="small">${m.last_login_at ? relative(m.last_login_at) : "never"}</td>
              <td class="right">${isAdmin ? `<button class="btn btn-ghost btn-sm" type="button" data-edit-member="${m.id}">Manage</button>` : ""}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>

    ${isAdmin && data.invites.length ? `<section class="card" style="margin-bottom:14px">
      <div class="card-head"><h2>Pending invitations</h2><span class="spacer"></span><span class="small muted">Invitation links are real, single-use tokens.</span></div>
      <div class="card-pad" style="padding-top:10px">
        ${data.invites.map((i) => `<div class="note-item" style="margin-bottom:8px">
          <div class="stack-row" style="justify-content:space-between">
            <div><strong>${esc(i.name || i.email)}</strong> <span class="badge role">${esc(i.role)}</span><div class="tiny muted">${esc(i.email)} · invited ${dateShort(i.created_at)}</div></div>
            <div class="stack-row"><button class="btn btn-ghost btn-sm" type="button" data-copy="${esc(i.invite_url)}">Copy link</button><button class="btn btn-danger btn-sm" type="button" data-revoke="${esc(i.token)}">Revoke</button></div>
          </div>
          <div class="mono tiny" style="margin-top:6px;word-break:break-all">${esc(i.invite_url)}</div>
        </div>`).join("")}
        <p class="tiny muted" style="margin:0">No email provider is used for invitations: copy the link and send it through your own channel. The link expires after 14 days.</p>
      </div>
    </section>` : ""}

    <div class="grid-2">
      <section class="card">
        <div class="card-head"><h2>Permissions by role</h2></div>
        <div class="card-pad">
          <div class="stack" style="gap:14px">
            ${Object.entries(data.permission_matrix).map(([role, items]) => `<div>
              <div class="stack-row"><span class="badge role">${esc(role)}</span></div>
              <ul style="margin:6px 0 0 16px;padding:0;font-size:.82rem;color:var(--ink-2)">
                ${items.map((i) => `<li>${esc(i)}</li>`).join("")}
              </ul>
            </div>`).join("")}
          </div>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Recent activity</h2><span class="spacer"></span><span class="small muted">audit trail</span></div>
        <div class="card-pad" style="max-height:420px;overflow:auto">
          ${activity.activity.length ? `<div class="timeline">${activity.activity.map((a) => `<div class="tl-item">
            <div><div class="tl-dot done"></div></div>
            <div class="tl-body"><div class="when">${esc(relative(a.created_at))} · ${esc(a.actor || "system")}</div>
              <div style="font-weight:600">${esc(String(a.action).replaceAll(".", " · "))}</div>
              <div class="text">${esc(a.detail || a.entity)}</div></div>
          </div>`).join("")}</div>` : '<div class="empty"><p>No activity recorded yet.</p></div>'}
        </div>
      </section>
    </div>`;

  root.querySelector("[data-invite]")?.addEventListener("click", () => openInviteModal(ctx, reload));
  root.querySelectorAll("[data-edit-member]").forEach((btn) => btn.addEventListener("click", () => {
    const member = data.members.find((m) => String(m.id) === btn.getAttribute("data-edit-member"));
    openMemberModal(member, ctx, reload);
  }));
  root.querySelectorAll("[data-copy]").forEach((btn) => btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(btn.getAttribute("data-copy"));
      toast("Invitation link copied.", "success");
    } catch {
      toast("Copy failed — select the link text manually.", "error");
    }
  }));
  root.querySelectorAll("[data-revoke]").forEach((btn) => btn.addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "Revoke invitation?", message: "The link stops working immediately.", confirmLabel: "Revoke", danger: true });
    if (!ok) return;
    try {
      await api(`/api/team/invite/${btn.getAttribute("data-revoke")}`, { method: "DELETE" });
      toast("Invitation revoked.");
      reload();
    } catch (err) { toast(err.message, "error"); }
  }));

  async function reload() {
    await render(root, ctx);
  }

  return { title: "Team", refresh: reload };
}

function openInviteModal(ctx, onDone) {
  const modal = openModal({
    title: "Invite a team member",
    body: `
      <form data-form>
        <div class="form-error" data-form-error hidden></div>
        <div class="field"><label for="iv-name">Name</label><input id="iv-name" name="name" maxlength="120" /></div>
        <div class="field" style="margin-top:10px"><label for="iv-email">Email *</label><input id="iv-email" name="email" type="email" required /></div>
        <div class="field" style="margin-top:10px"><label for="iv-role">Role</label><select id="iv-role" name="role">
          <option value="employee" selected>Employee — own leads only</option>
          <option value="manager">Manager — all leads and reports</option>
          <option value="admin">Administrator — full access</option>
        </select></div>
        <p class="tiny muted" style="margin-top:10px">An invitation link is generated for you to share. No email is sent automatically.</p>
      </form>`,
    footer: `<button class="btn btn-ghost" type="button" data-cancel>Cancel</button><button class="btn btn-primary" type="button" data-save>Create invitation</button>`,
    onMount(wrap, close) {
      wrap.querySelector("[data-cancel]").addEventListener("click", close);
      wrap.querySelector("[data-save]").addEventListener("click", async () => {
        const fd = Object.fromEntries(new FormData(wrap.querySelector("[data-form]")).entries());
        try {
          const res = await api("/api/team/invite", { method: "POST", body: fd });
          close();
          onDone?.();
          openModal({
            title: "Invitation created",
            body: `<p class="small">Share this single-use link with <strong>${esc(res.invite.email)}</strong>. It expires in 14 days.</p>
              <div class="mono tiny" style="word-break:break-all;background:#f8fafc;padding:10px;border-radius:8px;border:1px solid var(--line)">${esc(res.invite.invite_url)}</div>`,
            footer: `<button class="btn btn-ghost" type="button" data-copy>Copy link</button><button class="btn btn-primary" type="button" data-close>Done</button>`,
            onMount(w, closeW) {
              w.querySelector("[data-close]").addEventListener("click", closeW);
              w.querySelector("[data-copy]").addEventListener("click", async () => {
                try { await navigator.clipboard.writeText(res.invite.invite_url); toast("Link copied.", "success"); }
                catch { toast("Copy failed — select the link text manually.", "error"); }
              });
            },
          });
        } catch (err) {
          const box = wrap.querySelector("[data-form-error]");
          box.hidden = false;
          box.textContent = err.message;
        }
      });
    },
  });
  return modal;
}

function openMemberModal(member, ctx, onDone) {
  const modal = openModal({
    title: `Manage ${member.name}`,
    body: `
      <form data-form>
        <div class="form-error" data-form-error hidden></div>
        <div class="field"><label for="mb-name">Name</label><input id="mb-name" name="name" value="${esc(member.name)}" maxlength="120" /></div>
        <div class="form-grid" style="margin-top:10px">
          <div class="field"><label for="mb-role">Role</label><select id="mb-role" name="role">
            ${["admin", "manager", "employee"].map((r) => `<option value="${r}" ${member.role === r ? "selected" : ""}>${r}</option>`).join("")}
          </select></div>
          <div class="field"><label for="mb-status">Status</label><select id="mb-status" name="status">
            <option value="active" ${member.status === "active" ? "selected" : ""}>active</option>
            <option value="disabled" ${member.status === "disabled" ? "selected" : ""}>disabled</option>
          </select></div>
        </div>
        <p class="tiny muted" style="margin-top:10px">Disabling a member signs them out immediately. Their leads stay in the workspace and can be reassigned.</p>
        <div class="divider"></div>
        <div class="field"><label for="mb-password">Set a temporary password</label><input id="mb-password" name="password" type="text" minlength="10" placeholder="At least 10 characters, letters and numbers" />
          <span class="help">Useful when a member is locked out. They will be asked to change it after signing in.</span></div>
      </form>`,
    footer: `<button class="btn btn-ghost" type="button" data-cancel>Cancel</button><button class="btn btn-ghost" type="button" data-reset>Set password</button><button class="btn btn-primary" type="button" data-save>Save</button>`,
    onMount(wrap, close) {
      wrap.querySelector("[data-cancel]").addEventListener("click", close);
      wrap.querySelector("[data-save]").addEventListener("click", async () => {
        const fd = Object.fromEntries(new FormData(wrap.querySelector("[data-form]")).entries());
        try {
          await api(`/api/team/${member.id}`, { method: "PATCH", body: { name: fd.name, role: fd.role, status: fd.status } });
          toast("Team member updated.", "success");
          close();
          onDone?.();
        } catch (err) {
          const box = wrap.querySelector("[data-form-error]");
          box.hidden = false;
          box.textContent = err.message;
        }
      });
      wrap.querySelector("[data-reset]").addEventListener("click", async () => {
        const input = wrap.querySelector("#mb-password");
        if (!input.value) { toast("Enter a temporary password first.", "error"); return; }
        try {
          await api(`/api/team/${member.id}/reset-password`, { method: "POST", body: { password: input.value } });
          toast("Temporary password set. Share it with the team member directly.", "success");
          input.value = "";
        } catch (err) {
          const box = wrap.querySelector("[data-form-error]");
          box.hidden = false;
          box.textContent = err.message;
        }
      });
    },
  });
  return modal;
}
