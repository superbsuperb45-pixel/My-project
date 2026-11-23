import {
  api, esc, icons, dateTimeShort, number, toast, confirmDialog, openModal, debounce, can, state,
} from "./view-helpers.js";
import { openLeadDrawer } from "./lead-detail.js";

const CHANNELS = [["email", "Email"], ["whatsapp", "WhatsApp"], ["sms", "SMS"]];

function providerCard(key, label, provider, description) {
  const ok = Boolean(provider[key]);
  return `<div class="card card-pad">
    <div class="stack-row" style="justify-content:space-between">
      <strong style="font-size:.9rem">${esc(label)}</strong>
      <span class="badge ${ok ? "converted" : "outline"}">${ok ? "Configured" : "Needs configuration"}</span>
    </div>
    <p class="small muted" style="margin:8px 0 0">${esc(provider.detail?.[key] || description)}</p>
  </div>`;
}

export async function render(root, ctx) {
  const tab = ctx.query.get("tab") || "messages";
  const data = await api("/api/comms");
  const providers = data.providers;

  root.innerHTML = `
    <div class="page-head">
      <div class="titles">
        <h1>Communication center</h1>
        <p>Email, WhatsApp and SMS in one history, with templates and consent handling. Nothing is marked sent unless a provider accepted it.</p>
      </div>
      <div class="actions">
        <a class="btn btn-ghost btn-sm" href="/app/communications?tab=compose">${icons.plus} New message</a>
      </div>
    </div>

    <div class="grid-3" style="margin-bottom:14px">
      ${providerCard("email", "Email (Resend)", providers, "Email requires Resend credentials.")}
      ${providerCard("whatsapp", "WhatsApp (Meta Cloud API)", providers, "WhatsApp requires Meta Cloud API credentials.")}
      ${providerCard("sms", "SMS (Twilio)", providers, "SMS requires Twilio credentials.")}
    </div>

    <div class="info-box" >
      Provider credentials are read from server environment variables only, never from the browser. When a channel is not configured, you can still record a message as a manual contact so the interaction history stays accurate.
    </div>

    <div class="tabs" role="tablist" style="margin-top:14px">
      <button type="button" class="${tab === "messages" ? "on" : ""}" data-tab="messages">Message history (${data.messages.length})</button>
      <button type="button" class="${tab === "templates" ? "on" : ""}" data-tab="templates">Templates (${(data.templates || []).length})</button>
      <button type="button" class="${tab === "compose" ? "on" : ""}" data-tab="compose">Compose</button>
    </div>

    <div data-panel="messages" ${tab === "messages" ? "" : "hidden"}>
      <div class="card">
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th scope="col">When</th><th scope="col">Lead</th><th scope="col">Channel</th><th scope="col">Message</th><th scope="col">Status</th><th scope="col">Sent by</th></tr></thead>
            <tbody>
              ${data.messages.length ? data.messages.map((m) => `<tr>
                <td class="small nowrap">${dateTimeShort(m.created_at)}</td>
                <td class="small">${m.lead_id ? `<button class="btn-link" type="button" data-open="${m.lead_id}">${esc(m.lead_name || `Lead #${m.lead_id}`)}</button>` : "—"}</td>
                <td><span class="badge outline">${esc(m.channel)}</span></td>
                <td class="small" style="max-width:380px"><div style="font-weight:600">${esc(m.subject || "")}</div><div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:380px">${esc(m.body)}</div>
                  ${m.error ? `<div class="tiny" style="color:var(--danger);margin-top:2px">${esc(m.error)}</div>` : ""}</td>
                <td><span class="badge ${m.status === "sent" || m.status === "logged" ? "converted" : m.status === "failed" ? "overdue" : "outline"}">${esc(m.status)}</span></td>
                <td class="small">${esc(m.user_name || "—")}</td>
              </tr>`).join("") : `<tr><td colspan="6"><div class="empty"><p>No messages or logged contacts yet. Compose one, or log a call from a lead record.</p></div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div data-panel="templates" ${tab === "templates" ? "" : "hidden"}>
      <div class="card">
        <div class="card-head"><h2>Message templates</h2><span class="spacer"></span><button class="btn btn-primary btn-sm" type="button" data-new-template>${icons.plus} New template</button></div>
        <div class="card-pad" style="padding-top:10px">
          ${(data.templates || []).length ? `<div class="grid" style="gap:10px">${data.templates.map((t) => `<div class="note-item">
            <div class="stack-row" style="justify-content:space-between">
              <div><strong>${esc(t.name)}</strong> <span class="badge outline">${esc(t.channel)}</span></div>
              <div class="stack-row"><button class="btn btn-ghost btn-sm" type="button" data-edit-template="${t.id}">Edit</button><button class="btn btn-danger btn-sm" type="button" data-delete-template="${t.id}">Delete</button></div>
            </div>
            ${t.subject ? `<div class="small" style="margin-top:6px"><strong>Subject:</strong> ${esc(t.subject)}</div>` : ""}
            <div class="small muted" style="margin-top:4px;white-space:pre-wrap">${esc(t.body)}</div>
          </div>`).join("")}</div>` : `<div class="empty"><p>No templates yet. Templates support the merge fields {name}, {first_name}, {company}, {deal_value}, {employee} and {business}.</p></div>`}
        </div>
      </div>
    </div>

    <div data-panel="compose" ${tab === "compose" ? "" : "hidden"}>
      <div class="grid-2" style="grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);align-items:start">
        <section class="card card-pad">
          <h2 style="margin-bottom:10px">Compose a message</h2>
          <form data-compose>
            <div class="field"><label for="cp-lead">Lead *</label>
              <div class="search" style="position:relative">
                <input id="cp-lead-search" type="search" placeholder="Search by name, email or phone" data-lead-search autocomplete="off" />
                <div data-lead-results class="card" style="position:absolute;z-index:5;left:0;right:0;top:38px;max-height:220px;overflow:auto;display:none"></div>
              </div>
              <div class="small" data-lead-selected style="margin-top:6px;color:var(--muted)">No lead selected.</div>
              <input type="hidden" name="lead_id" data-lead-id />
            </div>
            <div class="form-grid" style="margin-top:10px">
              <div class="field"><label for="cp-channel">Channel</label><select id="cp-channel" name="channel">${CHANNELS.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></div>
              <div class="field"><label for="cp-template">Template</label><select id="cp-template" name="template_id"><option value="">No template</option>${(data.templates || []).map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select></div>
            </div>
            <div class="field" style="margin-top:10px"><label for="cp-subject">Subject (email only)</label><input id="cp-subject" name="subject" maxlength="200" /></div>
            <div class="field" style="margin-top:10px"><label for="cp-body">Message *</label><textarea id="cp-body" name="body" rows="6" required placeholder="Hi {first_name}, following up on your enquiry…"></textarea></div>
            <div class="stack-row" style="margin-top:12px">
              <button class="btn btn-accent btn-sm" type="submit">Send</button>
              <button class="btn btn-ghost btn-sm" type="button" data-log-only>Log as manual contact</button>
            </div>
            <p class="tiny muted" style="margin-top:8px">Sending to a customer with revoked consent or an opt-out is blocked by the server. WhatsApp and SMS also require recorded consent.</p>
          </form>
        </section>
        <aside class="card card-pad">
          <h3 style="font-size:.9rem">Delivery status</h3>
          <p class="small muted">A message is only marked <strong>sent</strong> when the provider returns success. If credentials are missing, the attempt is stored as failed with the provider's reason, so the history stays truthful.</p>
          <div class="divider"></div>
          <h3 style="font-size:.9rem">Merge fields</h3>
          <div class="stack-row" style="margin-top:6px">
            ${["{name}", "{first_name}", "{company}", "{deal_value}", "{employee}", "{business}"].map((f) => `<span class="badge outline mono">${esc(f)}</span>`).join("")}
          </div>
          <div class="divider"></div>
          <h3 style="font-size:.9rem">Consent</h3>
          <p class="small muted">Consent is stored per lead and shown in the lead record. Set it to revoked the moment a customer opts out; all sending stops immediately.</p>
        </aside>
      </div>
    </div>`;

  root.querySelectorAll("[data-tab]").forEach((btn) => btn.addEventListener("click", () => {
    const key = btn.getAttribute("data-tab");
    root.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("on", b === btn));
    root.querySelectorAll("[data-panel]").forEach((p) => { p.hidden = p.getAttribute("data-panel") !== key; });
    history.replaceState({}, "", `/app/communications?tab=${key}`);
  }));

  root.querySelectorAll("[data-open]").forEach((btn) => btn.addEventListener("click", () => {
    openLeadDrawer(btn.getAttribute("data-open"), ctx);
  }));

  // templates
  root.querySelector("[data-new-template]")?.addEventListener("click", () => openTemplateModal(null, ctx, reload));
  root.querySelectorAll("[data-edit-template]").forEach((btn) => btn.addEventListener("click", () => {
    const tpl = (data.templates || []).find((t) => String(t.id) === btn.getAttribute("data-edit-template"));
    openTemplateModal(tpl, ctx, reload);
  }));
  root.querySelectorAll("[data-delete-template]").forEach((btn) => btn.addEventListener("click", async () => {
    const tpl = (data.templates || []).find((t) => String(t.id) === btn.getAttribute("data-delete-template"));
    const ok = await confirmDialog({ title: "Delete template?", message: `Delete <strong>${esc(tpl?.name || "this template")}</strong>? Existing message history is unaffected.`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    try {
      await api(`/api/comms/templates/${tpl.id}`, { method: "DELETE" });
      toast("Template deleted.");
      reload();
    } catch (err) {
      toast(err.message, "error");
    }
  }));

  // compose lead picker
  const searchInput = root.querySelector("[data-lead-search]");
  const results = root.querySelector("[data-lead-results]");
  const hidden = root.querySelector("[data-lead-id]");
  const selectedLabel = root.querySelector("[data-lead-selected]");
  let selected = null;
  const runSearch = debounce(async () => {
    const q = searchInput.value.trim();
    if (q.length < 2) { results.style.display = "none"; return; }
    try {
      const res = await api(`/api/leads?q=${encodeURIComponent(q)}&limit=8`);
      results.innerHTML = res.leads.length
        ? res.leads.map((l) => `<button type="button" class="btn-link" data-pick="${l.id}" style="display:block;width:100%;text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);color:var(--ink)"><strong style="font-size:.82rem">${esc(l.name)}</strong><div class="tiny muted">${esc(l.email || l.phone || "")} ${l.consent === "revoked" || l.opted_out ? "· opted out" : ""}</div></button>`).join("")
        : `<div class="tiny muted" style="padding:10px">No leads match that search.</div>`;
      results.style.display = "block";
      results.querySelectorAll("[data-pick]").forEach((btn) => btn.addEventListener("click", () => {
        selected = res.leads.find((l) => String(l.id) === btn.getAttribute("data-pick"));
        hidden.value = selected.id;
        selectedLabel.innerHTML = `<strong>${esc(selected.name)}</strong> · ${esc(selected.email || selected.phone || "")} · consent: ${esc(selected.consent)}${selected.opted_out ? " · <span style=\"color:var(--danger)\">opted out</span>" : ""}`;
        results.style.display = "none";
        searchInput.value = selected.name;
      }));
    } catch (err) {
      results.innerHTML = `<div class="tiny" style="padding:10px;color:var(--danger)">${esc(err.message)}</div>`;
      results.style.display = "block";
    }
  }, 240);
  searchInput?.addEventListener("input", () => { hidden.value = ""; runSearch(); });
  root.querySelector("#cp-template")?.addEventListener("change", (event) => {
    const tpl = (data.templates || []).find((t) => String(t.id) === event.target.value);
    if (!tpl) return;
    root.querySelector("#cp-channel").value = tpl.channel;
    root.querySelector("#cp-subject").value = tpl.subject || "";
    root.querySelector("#cp-body").value = tpl.body || "";
  });

  async function submitCompose(logOnly) {
    const form = root.querySelector("[data-compose]");
    const fd = Object.fromEntries(new FormData(form).entries());
    if (!fd.lead_id) { toast("Choose a lead first.", "error"); return; }
    const btn = logOnly ? form.querySelector("[data-log-only]") : form.querySelector("button[type=submit]");
    btn.disabled = true;
    const original = btn.innerHTML;
    btn.innerHTML = `<span class="spinner"></span>`;
    try {
      await api("/api/comms/send", { method: "POST", body: { ...fd, log_only: logOnly } });
      toast(logOnly ? "Contact logged." : "Message accepted by the provider.", "success");
      reload();
    } catch (err) {
      toast(err.message, "error");
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }

  root.querySelector("[data-compose]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitCompose(false);
  });
  root.querySelector("[data-log-only]")?.addEventListener("click", () => submitCompose(true));

  async function reload() {
    await render(root, { ...ctx, query: new URLSearchParams({ tab: "messages" }) });
  }

  return { title: "Communication center", refresh: reload };
}

function openTemplateModal(tpl, ctx, onDone) {
  const modal = openModal({
    title: tpl ? "Edit template" : "New template",
    wide: true,
    body: `
      <form data-form>
        <div class="form-error" data-form-error hidden></div>
        <div class="form-grid">
          <div class="field"><label for="tp-name">Template name *</label><input id="tp-name" name="name" required maxlength="100" value="${esc(tpl?.name || "")}" /></div>
          <div class="field"><label for="tp-channel">Channel</label><select id="tp-channel" name="channel">${CHANNELS.map(([k, l]) => `<option value="${k}" ${tpl?.channel === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
          <div class="field full"><label for="tp-subject">Subject (email)</label><input id="tp-subject" name="subject" maxlength="200" value="${esc(tpl?.subject || "")}" /></div>
          <div class="field full"><label for="tp-body">Body *</label><textarea id="tp-body" name="body" rows="6" required>${esc(tpl?.body || "")}</textarea>
            <span class="help">Merge fields: {name} {first_name} {company} {deal_value} {employee} {business}</span></div>
        </div>
      </form>`,
    footer: `<button class="btn btn-ghost" type="button" data-cancel>Cancel</button><button class="btn btn-primary" type="button" data-save>Save template</button>`,
    onMount(wrap, close) {
      wrap.querySelector("[data-cancel]").addEventListener("click", close);
      wrap.querySelector("[data-save]").addEventListener("click", async () => {
        const fd = Object.fromEntries(new FormData(wrap.querySelector("[data-form]")).entries());
        try {
          if (tpl) await api(`/api/comms/templates/${tpl.id}`, { method: "PATCH", body: fd });
          else await api("/api/comms/templates", { method: "POST", body: fd });
          toast("Template saved.", "success");
          close();
          onDone?.();
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
