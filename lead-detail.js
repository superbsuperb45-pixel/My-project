import {
  api, esc, icons, money, number, pct, dateShort, dateTimeShort, relative, untilText,
  statusBadge, scoreBadge, openDrawer, openModal, toast, toLocalInput, toDateInput, confirmDialog, state, can,
} from "./view-helpers.js";

const STATUS_LABELS = {
  call: "Call", email: "Email", whatsapp: "WhatsApp", sms: "SMS", meeting: "Meeting", note: "Note", visit: "Visit",
};

function scorePanel(score) {
  if (!score) return "";
  return `
    <div class="card card-pad" style="margin-bottom:14px">
      <div class="stack-row" style="justify-content:space-between">
        <div><div class="tiny muted">Priority score</div><div style="font-size:1.5rem;font-weight:660;line-height:1.1">${score.score}<span class="muted" style="font-size:.8rem;font-weight:500"> / 100 · ${esc(score.bandLabel)}</span></div></div>
        ${scoreBadge(score)}
      </div>
      <div style="margin-top:10px">
        ${score.factors.map((f) => `<div class="factor"><span class="name">${esc(f.label)}</span><span class="pts">${f.points}/${f.max}</span><span class="why">${esc(f.reason)}</span></div>`).join("")}
      </div>
      <p class="tiny muted" style="margin:10px 0 0">${esc(score.disclaimer)}</p>
    </div>`;
}

function overviewTab(data, ctx) {
  const { lead, recovery } = data;
  const openFlags = recovery.filter((r) => r.status === "open");
  return `
    ${openFlags.length ? `<div class="danger-box" style="margin-bottom:12px">
      <strong>${openFlags.length} open recovery flag${openFlags.length > 1 ? "s" : ""}</strong>
      <ul style="margin:6px 0 0 16px;padding:0">${openFlags.map((f) => `<li>${esc(f.recommendation)}</li>`).join("")}</ul>
    </div>` : ""}
    ${lead.opted_out ? `<div class="warn-box" style="margin-bottom:12px">This customer has opted out. Email, WhatsApp and SMS sending is blocked until consent is recorded again.</div>` : ""}
    <div class="card card-pad" style="margin-bottom:14px">
      <dl class="kv">
        <dt>Status</dt><dd>${statusBadge(lead.status, ctx.state.settings)}</dd>
        <dt>Phone</dt><dd>${lead.phone ? `<a href="tel:${esc(lead.phone)}">${esc(lead.phone)}</a>` : '<span class="muted">Not provided</span>'}</dd>
        <dt>Email</dt><dd>${lead.email ? `<a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a>` : '<span class="muted">Not provided</span>'}</dd>
        <dt>Company</dt><dd>${lead.company ? esc(lead.company) : '<span class="muted">—</span>'}</dd>
        <dt>Lead source</dt><dd>${lead.source ? esc(lead.source) : '<span class="muted">—</span>'}</dd>
        <dt>Deal value</dt><dd class="num">${money(lead.deal_value, ctx.state.org.currency)}</dd>
        <dt>Assigned to</dt><dd>${esc(lead.assignee_name || "Unassigned")}</dd>
        <dt>Received</dt><dd>${dateShort(lead.received_at)} <span class="muted tiny">(${relative(lead.received_at)})</span></dd>
        <dt>Last contact</dt><dd>${lead.last_contact_at ? `${dateShort(lead.last_contact_at)} <span class="muted tiny">(${relative(lead.last_contact_at)})</span>` : '<span class="muted">No contact logged</span>'}</dd>
        <dt>First response</dt><dd>${lead.first_response_at ? dateShort(lead.first_response_at) : '<span style="color:var(--danger)">No response yet</span>'}</dd>
        <dt>Next follow-up</dt><dd>${lead.follow_up_at ? `${dateTimeShort(lead.follow_up_at)} <span class="tiny ${lead.is_overdue_followup ? "" : "muted"}" style="${lead.is_overdue_followup ? "color:var(--danger)" : ""}">(${untilText(lead.follow_up_at)})</span>` : '<span class="muted">None scheduled</span>'}</dd>
        <dt>Consent</dt><dd style="text-transform:capitalize">${esc(lead.consent)}${lead.opted_out ? " · opted out" : ""}</dd>
        ${lead.recovered_at ? `<dt>Recovered</dt><dd>${dateShort(lead.recovered_at)} · ${money(lead.recovered_value ?? lead.deal_value, ctx.state.org.currency)}</dd>` : ""}
        ${lead.converted_at ? `<dt>Converted</dt><dd>${dateShort(lead.converted_at)}</dd>` : ""}
        ${lead.lost_reason ? `<dt>Lost reason</dt><dd>${esc(lead.lost_reason)}</dd>` : ""}
      </dl>
    </div>
    ${lead.notes ? `<div class="card card-pad" style="margin-bottom:14px"><div class="tiny muted" style="margin-bottom:4px">Notes</div><div style="white-space:pre-wrap;font-size:.85rem">${esc(lead.notes)}</div></div>` : ""}
    ${recovery.length ? `<div class="card">
      <div class="card-head"><h2>Recovery history</h2></div>
      <div class="card-pad">
        ${recovery.map((r) => `<div class="stack-row" style="justify-content:space-between;align-items:flex-start;padding:7px 0;border-bottom:1px dashed var(--line)">
          <div style="max-width:70%"><div style="font-size:.82rem;font-weight:600">${esc(r.rule_label)}</div><div class="tiny muted">${esc(r.resolution ? `Resolved: ${r.resolution.replaceAll("_", " ")}` : "Open")} · ${dateShort(r.status === "open" ? r.detected_at : r.resolved_at)}</div></div>
          <span class="badge ${r.status === "open" ? "overdue" : "recovered"}">${r.status === "open" ? "Open" : "Resolved"}</span>
        </div>`).join("")}
      </div>
    </div>` : ""}`;
}

function historyTab(data) {
  const items = [];
  for (const i of data.interactions) {
    items.push({
      when: i.created_at,
      dot: i.outcome === "conversion" ? "" : "",
      title: `${STATUS_LABELS[i.type] || i.type}${i.outcome && i.outcome !== "none" ? ` · ${i.outcome.replaceAll("_", " ")}` : ""}`,
      text: i.summary,
      who: i.user_name || "System",
      kind: "interaction",
    });
  }
  for (const f of data.followups) {
    items.push({
      when: f.status === "completed" ? f.completed_at : f.due_at,
      dot: f.status === "completed" ? "done" : "",
      title: `Follow-up ${f.status}${f.outcome && f.outcome !== "none" ? ` · ${f.outcome.replaceAll("_", " ")}` : ""}`,
      text: f.note || `${f.channel} follow-up with ${f.assignee_name || "unassigned"}`,
      who: f.assignee_name || "Unassigned",
      kind: "followup",
    });
  }
  for (const r of data.recovery) {
    items.push({
      when: r.status === "open" ? r.detected_at : r.resolved_at,
      dot: r.status === "open" ? "flag" : "done",
      title: r.status === "open" ? "Recovery flag opened" : `Recovery flag ${r.resolution?.replaceAll("_", " ")}`,
      text: r.recommendation,
      who: "Recovery engine",
      kind: "recovery",
    });
  }
  items.sort((a, b) => new Date(b.when) - new Date(a.when));
  if (!items.length) {
    return `<div class="empty"><div class="empty-icon">${icons.clock}</div><h3>No history yet</h3><p>Log a call, message or note and it will appear here in chronological order.</p></div>`;
  }
  return `<div class="timeline">${items.map((i) => `<div class="tl-item"><div><div class="tl-dot ${i.dot}"></div></div>
    <div class="tl-body"><div class="when">${esc(dateTimeShort(i.when))} · ${esc(i.who)}</div>
      <div style="font-weight:600;margin-top:1px">${esc(i.title)}</div>
      <div class="text">${esc(i.text)}</div></div></div>`).join("")}</div>`;
}

function commsTab(data, ctx) {
  const messages = data.messages || [];
  return `
    <div class="warn-box" style="margin-bottom:12px">
      Channels are only active when provider credentials exist on the server. Check Settings → Integrations for the current status before sending.
    </div>
    <form data-comms-form class="card card-pad" style="margin-bottom:14px">
      <div class="form-grid">
        <div class="field"><label for="comm-channel">Channel</label>
          <select id="comm-channel" name="channel">
            <option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option>
          </select></div>
        <div class="field"><label for="comm-template">Template (optional)</label><select id="comm-template" name="template_id"><option value="">No template</option></select></div>
        <div class="field full"><label for="comm-subject">Subject (email only)</label><input id="comm-subject" name="subject" maxlength="200" /></div>
        <div class="field full"><label for="comm-body">Message</label><textarea id="comm-body" name="body" rows="4" required placeholder="Hi {name}, I wanted to follow up on your enquiry…"></textarea>
          <span class="help">Merge fields: {name} {first_name} {company} {deal_value} {employee} {business}</span></div>
      </div>
      <div class="stack-row" style="margin-top:10px">
        <button class="btn btn-accent btn-sm" type="submit">Send message</button>
        <button class="btn btn-ghost btn-sm" type="button" data-log-only>Log as manual contact</button>
        <span class="tiny muted">Sends are recorded with their real delivery status.</span>
      </div>
    </form>
    <div class="card">
      <div class="card-head"><h2>Messages and logged contacts</h2><span class="spacer"></span><a class="small" href="/app/communications">All communication</a></div>
      <div class="card-pad" style="padding-top:8px">
        ${messages.length ? messages.map((m) => `<div style="padding:9px 0;border-bottom:1px dashed var(--line)">
          <div class="stack-row" style="justify-content:space-between">
            <div><span class="badge outline">${esc(m.channel)}</span> <span class="tiny muted">${esc(dateTimeShort(m.created_at))}</span></div>
            <span class="badge ${m.status === "sent" || m.status === "logged" ? "converted" : m.status === "failed" ? "overdue" : "outline"}">${esc(m.status)}</span>
          </div>
          ${m.subject ? `<div style="font-weight:600;font-size:.84rem;margin-top:4px">${esc(m.subject)}</div>` : ""}
          <div style="font-size:.82rem;margin-top:3px;white-space:pre-wrap">${esc(m.body)}</div>
          ${m.error ? `<div class="tiny" style="color:var(--danger);margin-top:3px">${esc(m.error)}</div>` : ""}
        </div>`).join("") : '<div class="empty"><p>No messages or logged contacts for this lead yet.</p></div>'}
      </div>
    </div>`;
}

export async function openLeadDrawer(leadId, ctx, { onChanged } = {}) {
  const data = await api(`/api/leads/${leadId}`);
  const lead = data.lead;
  let activeTab = "overview";

  const body = () => `
    <div class="stack-row" style="margin-bottom:12px">
      <span class="avatar lg">${esc((lead.name || "?").slice(0, 2).toUpperCase())}</span>
      <div style="min-width:0">
        <div style="font-weight:650;font-size:1rem">${esc(lead.name)}</div>
        <div class="small muted">${esc(lead.company || lead.email || lead.phone || "")} ${lead.assignee_name ? `· ${esc(lead.assignee_name)}` : ""}</div>
      </div>
      <div style="margin-left:auto" class="stack-row">
        ${statusBadge(lead.status, ctx.state.settings)}
        ${scoreBadge(lead.score)}
      </div>
    </div>
    <div class="tabs" role="tablist">
      <button type="button" class="${activeTab === "overview" ? "on" : ""}" data-tab="overview">Overview</button>
      <button type="button" class="${activeTab === "history" ? "on" : ""}" data-tab="history">History (${data.interactions.length + data.followups.length})</button>
      <button type="button" class="${activeTab === "comms" ? "on" : ""}" data-tab="comms">Communication (${(data.messages || []).length})</button>
    </div>
    <div data-tab-content>
      <div data-panel="overview" ${activeTab === "overview" ? "" : "hidden"}>${scorePanel(lead.score)}${overviewTab(data, ctx)}</div>
      <div data-panel="history" ${activeTab === "history" ? "" : "hidden"}><div class="card card-pad">${historyTab(data)}</div></div>
      <div data-panel="comms" ${activeTab === "comms" ? "" : "hidden"}">${commsTab(data, ctx)}</div>
    </div>`;

  const footer = () => `
    <button class="btn btn-accent btn-sm" type="button" data-act="interaction">${icons.plus} Log interaction</button>
    <button class="btn btn-ghost btn-sm" type="button" data-act="followup">${icons.clock} Schedule follow-up</button>
    <button class="btn btn-ghost btn-sm" type="button" data-act="edit">Edit lead</button>
    ${lead.recovered_at ? "" : `<button class="btn btn-ghost btn-sm" type="button" data-act="recover">Mark recovered</button>`}
    ${lead.status === "converted" ? "" : `<button class="btn btn-ghost btn-sm" type="button" data-act="convert">Mark converted</button>`}
    ${lead.status === "lost" ? "" : `<button class="btn btn-ghost btn-sm" type="button" data-act="lost">Mark lost</button>`}
    ${can("lead:delete") ? `<button class="btn btn-danger btn-sm" type="button" data-act="delete" style="margin-left:auto">Delete</button>` : ""}`;

  const ui = openDrawer({
    title: lead.name,
    subtitle: `${esc(lead.status)} · ${esc(lead.source || "no source")} · ${money(lead.deal_value, ctx.state.org.currency)}`,
    body: body(),
    footer: footer(),
    onMount(drawer) {
      drawer.addEventListener("click", async (event) => {
        const tabBtn = event.target.closest("[data-tab]");
        if (tabBtn) {
          activeTab = tabBtn.getAttribute("data-tab");
          drawer.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("on", b === tabBtn));
          drawer.querySelectorAll("[data-panel]").forEach((p) => { p.hidden = p.getAttribute("data-panel") !== activeTab; });
          if (activeTab === "comms") await loadTemplates(drawer);
          return;
        }
        const actBtn = event.target.closest("[data-act]");
        if (actBtn) {
          const act = actBtn.getAttribute("data-act");
          if (act === "interaction") openInteractionModal(lead, ctx, refresh);
          if (act === "followup") openFollowupModal(lead, ctx, refresh);
          if (act === "edit") openLeadForm({ lead, ctx, onSaved: refresh });
          if (act === "recover") openRecoverModal(lead, ctx, refresh);
          if (act === "convert") openConvertModal(lead, ctx, refresh);
          if (act === "lost") openLostModal(lead, ctx, refresh);
          if (act === "delete") {
            const ok = await confirmDialog({ title: "Delete this lead?", message: `This permanently deletes <strong>${esc(lead.name)}</strong>, its interactions and follow-ups. This cannot be undone.`, confirmLabel: "Delete lead", danger: true });
            if (!ok) return;
            await api(`/api/leads/${lead.id}`, { method: "DELETE" });
            toast("Lead deleted.", "success");
            ui.close();
            onChanged?.();
          }
          return;
        }
        if (event.target.closest("[data-log-only]")) {
          const form = drawer.querySelector("[data-comms-form]");
          await submitComms(drawer, form, lead, ctx, true, refresh);
        }
      });

      drawer.addEventListener("submit", async (event) => {
        const form = event.target.closest("[data-comms-form]");
        if (!form) return;
        event.preventDefault();
        await submitComms(drawer, form, lead, ctx, false, refresh);
      });
    },
  });

  async function loadTemplates(drawer) {
    try {
      const res = await api("/api/comms");
      const select = drawer.querySelector("[data-comms-form] select[name=template_id]");
      if (!select) return;
      select.innerHTML = `<option value="">No template</option>` + (res.templates || []).map((t) => `<option value="${t.id}">${esc(t.name)} (${esc(t.channel)})</option>`).join("");
      select.onchange = () => {
        const tpl = (res.templates || []).find((t) => String(t.id) === select.value);
        if (!tpl) return;
        const form = drawer.querySelector("[data-comms-form]");
        form.querySelector("[name=channel]").value = tpl.channel;
        form.querySelector("[name=subject]").value = tpl.subject || "";
        form.querySelector("[name=body]").value = tpl.body || "";
      };
    } catch { /* templates are optional */ }
  }

  async function submitComms(drawer, form, lead, ctx, logOnly, refresh) {
    const fd = new FormData(form);
    const payload = {
      lead_id: lead.id,
      channel: fd.get("channel"),
      subject: fd.get("subject") || "",
      body: fd.get("body"),
      template_id: fd.get("template_id") || null,
      log_only: logOnly,
    };
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    const original = button.innerHTML;
    button.innerHTML = `<span class="spinner"></span>`;
    try {
      await api("/api/comms/send", { method: "POST", body: payload });
      toast(logOnly ? "Contact logged to the communication history." : "Message accepted by the provider.", "success");
      form.reset();
      await refresh();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      button.disabled = false;
      button.innerHTML = original;
    }
  }

  async function refresh() {
    ui.close();
    await openLeadDrawer(leadId, ctx, { onChanged });
    onChanged?.();
  }

  return ui;
}

export function openLeadForm({ lead = null, ctx, onSaved }) {
  const settings = ctx.state.settings;
  const team = ctx.state.team;
  const isEdit = Boolean(lead);
  const body = `
    <form data-lead-form novalidate>
      <div class="form-error" data-form-error hidden></div>
      <div class="form-grid">
        <div class="field"><label for="lf-name">Customer name *</label><input id="lf-name" name="name" required maxlength="160" value="${esc(lead?.name || "")}" /></div>
        <div class="field"><label for="lf-company">Company</label><input id="lf-company" name="company" maxlength="160" value="${esc(lead?.company || "")}" /></div>
        <div class="field"><label for="lf-email">Email</label><input id="lf-email" name="email" type="email" value="${esc(lead?.email || "")}" /></div>
        <div class="field"><label for="lf-phone">Phone</label><input id="lf-phone" name="phone" type="tel" value="${esc(lead?.phone || "")}" /></div>
        <div class="field"><label for="lf-source">Lead source</label>
          <select id="lf-source" name="source">${["", ...settings.sources].map((s) => `<option value="${esc(s)}" ${lead?.source === s ? "selected" : ""}>${esc(s || "Select a source")}</option>`).join("")}</select></div>
        <div class="field"><label for="lf-status">Status</label>
          <select id="lf-status" name="status">${settings.statuses.map((s) => `<option value="${esc(s.key)}" ${lead?.status === s.key ? "selected" : ""}>${esc(s.label)}</option>`).join("")}</select></div>
        <div class="field"><label for="lf-value">Potential deal value (${esc(ctx.state.org.currency)})</label><input id="lf-value" name="deal_value" type="number" min="0" step="0.01" value="${esc(lead?.deal_value ?? "")}" /></div>
        <div class="field"><label for="lf-assignee">Assigned to</label>
          <select id="lf-assignee" name="assigned_to"><option value="">Unassigned</option>${team.map((m) => `<option value="${m.id}" ${String(lead?.assigned_to) === String(m.id) ? "selected" : ""}>${esc(m.name)} (${esc(m.role)})</option>`).join("")}</select></div>
        <div class="field"><label for="lf-received">Date received</label><input id="lf-received" name="received_at" type="date" value="${esc(toDateInput(lead?.received_at || new Date().toISOString()))}" /></div>
        <div class="field"><label for="lf-followup">Follow-up date</label><input id="lf-followup" name="follow_up_at" type="datetime-local" value="${esc(toLocalInput(lead?.follow_up_at))}" /></div>
        <div class="field"><label for="lf-consent">Consent</label>
          <select id="lf-consent" name="consent">
            <option value="unknown" ${lead?.consent === "unknown" || !lead ? "selected" : ""}>Unknown / not recorded</option>
            <option value="granted" ${lead?.consent === "granted" ? "selected" : ""}>Granted — customer agreed to be contacted</option>
            <option value="revoked" ${lead?.consent === "revoked" ? "selected" : ""}>Revoked — opted out</option>
          </select></div>
        <div class="field full"><label for="lf-notes">Notes</label><textarea id="lf-notes" name="notes" rows="3" maxlength="5000">${esc(lead?.notes || "")}</textarea></div>
      </div>
      <p class="tiny muted" style="margin:8px 0 0">A phone number or email address is required. Values are validated on the server.</p>
    </form>`;
  const modal = openModal({
    title: isEdit ? "Edit lead" : "Add a lead",
    wide: true,
    body,
    footer: `<button class="btn btn-ghost" type="button" data-cancel>Cancel</button><button class="btn btn-primary" type="button" data-save>${isEdit ? "Save changes" : "Create lead"}</button>`,
    onMount(wrap, close) {
      wrap.querySelector("[data-cancel]").addEventListener("click", close);
      wrap.querySelector("[data-save]").addEventListener("click", async () => {
        const form = wrap.querySelector("[data-lead-form]");
        const errorBox = wrap.querySelector("[data-form-error]");
        const fd = Object.fromEntries(new FormData(form).entries());
        for (const key of ["follow_up_at", "received_at"]) {
          if (fd[key]) fd[key] = new Date(fd[key]).toISOString();
        }
        if (fd.assigned_to === "") fd.assigned_to = null;
        const btn = wrap.querySelector("[data-save]");
        btn.disabled = true;
        const original = btn.innerHTML;
        btn.innerHTML = `<span class="spinner"></span> Saving…`;
        try {
          const res = isEdit
            ? await api(`/api/leads/${lead.id}`, { method: "PATCH", body: fd })
            : await api("/api/leads", { method: "POST", body: fd });
          toast(isEdit ? "Lead updated." : "Lead created.", "success");
          close();
          onSaved?.(res.lead);
        } catch (err) {
          errorBox.hidden = false;
          errorBox.textContent = err.message;
          btn.disabled = false;
          btn.innerHTML = original;
        }
      });
    },
  });
  return modal;
}

function openInteractionModal(lead, ctx, onSaved) {
  const modal = openModal({
    title: "Log interaction",
    body: `
      <form data-form novalidate>
        <div class="form-error" data-form-error hidden></div>
        <div class="form-grid">
          <div class="field"><label for="it-type">Type</label><select id="it-type" name="type">
            <option value="call">Call</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option>
            <option value="sms">SMS</option><option value="meeting">Meeting</option><option value="visit">Visit</option><option value="note">Note</option>
          </select></div>
          <div class="field"><label for="it-direction">Direction</label><select id="it-direction" name="direction">
            <option value="outbound">Outbound (we contacted them)</option><option value="inbound">Inbound (they replied)</option><option value="internal">Internal note</option>
          </select></div>
          <div class="field"><label for="it-outcome">Outcome</label><select id="it-outcome" name="outcome">
            <option value="none">No outcome recorded</option><option value="response">Got a response</option>
            <option value="new_opportunity">New opportunity</option><option value="conversion">Conversion</option><option value="no_response">No response</option>
          </select></div>
          <div class="field"><label for="it-status">Set status (optional)</label><select id="it-status" name="status">
            <option value="">Keep current status</option>
            ${ctx.state.settings.statuses.map((s) => `<option value="${esc(s.key)}">${esc(s.label)}</option>`).join("")}
          </select></div>
          <div class="field full"><label for="it-summary">What happened? *</label><textarea id="it-summary" name="summary" required rows="3" placeholder="Called about the quote, asked for a revised price by Friday."></textarea></div>
        </div>
      </form>`,
    footer: `<button class="btn btn-ghost" type="button" data-cancel>Cancel</button><button class="btn btn-primary" type="button" data-save>Save interaction</button>`,
    onMount(wrap, close) {
      wrap.querySelector("[data-cancel]").addEventListener("click", close);
      wrap.querySelector("[data-save]").addEventListener("click", async () => {
        const fd = Object.fromEntries(new FormData(wrap.querySelector("[data-form]")).entries());
        if (!fd.status) delete fd.status;
        const errorBox = wrap.querySelector("[data-form-error]");
        try {
          await api(`/api/leads/${lead.id}/interactions`, { method: "POST", body: fd });
          toast("Interaction logged. Recovery flags for this lead were updated.", "success");
          close();
          onSaved?.();
        } catch (err) {
          errorBox.hidden = false;
          errorBox.textContent = err.message;
        }
      });
    },
  });
  return modal;
}

function openFollowupModal(lead, ctx, onSaved) {
  const defaultDue = new Date(Date.now() + (ctx.state.settings.followup.default_interval_days || 2) * 86400000);
  const modal = openModal({
    title: "Schedule follow-up",
    body: `
      <form data-form novalidate>
        <div class="form-error" data-form-error hidden></div>
        <div class="form-grid">
          <div class="field"><label for="fu-due">Due date and time *</label><input id="fu-due" name="due_at" type="datetime-local" required value="${esc(toLocalInput(defaultDue.toISOString()))}" /></div>
          <div class="field"><label for="fu-channel">Channel</label><select id="fu-channel" name="channel">
            <option value="call">Call</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option><option value="meeting">Meeting</option>
          </select></div>
          <div class="field"><label for="fu-assignee">Assigned to</label><select id="fu-assignee" name="assigned_to">
            ${ctx.state.team.map((m) => `<option value="${m.id}" ${String(lead.assigned_to) === String(m.id) ? "selected" : ""}>${esc(m.name)}</option>`).join("")}
          </select></div>
          <div class="field full"><label for="fu-note">What needs to happen?</label><textarea id="fu-note" name="note" rows="2" maxlength="1000" placeholder="Send revised quote and confirm delivery date."></textarea></div>
        </div>
      </form>`,
    footer: `<button class="btn btn-ghost" type="button" data-cancel>Cancel</button><button class="btn btn-primary" type="button" data-save>Schedule</button>`,
    onMount(wrap, close) {
      wrap.querySelector("[data-cancel]").addEventListener("click", close);
      wrap.querySelector("[data-save]").addEventListener("click", async () => {
        const fd = Object.fromEntries(new FormData(wrap.querySelector("[data-form]")).entries());
        if (fd.due_at) fd.due_at = new Date(fd.due_at).toISOString();
        try {
          await api(`/api/leads/${lead.id}/followups`, { method: "POST", body: fd });
          toast("Follow-up scheduled.", "success");
          close();
          onSaved?.();
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

function openRecoverModal(lead, ctx, onSaved) {
  const modal = openModal({
    title: "Mark lead recovered",
    body: `
      <p class="small">Only use this when the customer genuinely came back into an active conversation. Resolving a recovery flag as recovered records the value separately from ordinary pipeline.</p>
      <form data-form>
        <div class="field"><label for="rv-value">Recovered value (${esc(ctx.state.org.currency)})</label><input id="rv-value" name="recovered_value" type="number" min="0" step="0.01" value="${esc(lead.deal_value || "")}" /></div>
      </form>`,
    footer: `<button class="btn btn-ghost" type="button" data-cancel>Cancel</button><button class="btn btn-accent" type="button" data-save>Mark recovered</button>`,
    onMount(wrap, close) {
      wrap.querySelector("[data-cancel]").addEventListener("click", close);
      wrap.querySelector("[data-save]").addEventListener("click", async () => {
        const fd = Object.fromEntries(new FormData(wrap.querySelector("[data-form]")).entries());
        try {
          await api(`/api/leads/${lead.id}/recover`, { method: "POST", body: fd });
          toast("Lead marked as recovered.", "success");
          close();
          onSaved?.();
        } catch (err) {
          toast(err.message, "error");
        }
      });
    },
  });
  return modal;
}

function openConvertModal(lead, ctx, onSaved) {
  const modal = openModal({
    title: "Mark lead converted",
    body: `
      <form data-form>
        <div class="field"><label for="cv-value">Deal value (${esc(ctx.state.org.currency)})</label><input id="cv-value" name="deal_value" type="number" min="0" step="0.01" value="${esc(lead.deal_value || "")}" /></div>
        <div class="field" style="margin-top:10px"><label for="cv-date">Conversion date</label><input id="cv-date" name="at" type="date" value="${esc(toDateInput(new Date().toISOString()))}" /></div>
      </form>`,
    footer: `<button class="btn btn-ghost" type="button" data-cancel>Cancel</button><button class="btn btn-accent" type="button" data-save>Mark converted</button>`,
    onMount(wrap, close) {
      wrap.querySelector("[data-cancel]").addEventListener("click", close);
      wrap.querySelector("[data-save]").addEventListener("click", async () => {
        const fd = Object.fromEntries(new FormData(wrap.querySelector("[data-form]")).entries());
        if (fd.at) fd.at = new Date(fd.at).toISOString();
        try {
          await api(`/api/leads/${lead.id}/convert`, { method: "POST", body: fd });
          toast("Lead converted.", "success");
          close();
          onSaved?.();
        } catch (err) {
          toast(err.message, "error");
        }
      });
    },
  });
  return modal;
}

function openLostModal(lead, ctx, onSaved) {
  const modal = openModal({
    title: "Mark lead lost",
    body: `
      <p class="small">A lost reason is required. It feeds the lost-opportunity report so you can see where revenue leaks.</p>
      <form data-form>
        <div class="field"><label for="ls-reason">Reason *</label>
          <select id="ls-reason" name="lost_reason_select">
            <option>Went silent</option><option>Chose a competitor</option><option>Price too high</option>
            <option>No budget</option><option>Not ready to buy</option><option>Duplicate or spam</option><option>Other</option>
          </select></div>
        <div class="field" style="margin-top:10px"><label for="ls-detail">Details (optional)</label><input id="ls-detail" name="detail" maxlength="200" /></div>
      </form>`,
    footer: `<button class="btn btn-ghost" type="button" data-cancel>Cancel</button><button class="btn btn-danger" type="button" data-save>Mark lost</button>`,
    onMount(wrap, close) {
      wrap.querySelector("[data-cancel]").addEventListener("click", close);
      wrap.querySelector("[data-save]").addEventListener("click", async () => {
        const fd = Object.fromEntries(new FormData(wrap.querySelector("[data-form]")).entries());
        const reason = fd.detail ? `${fd.lost_reason_select} — ${fd.detail}` : fd.lost_reason_select;
        try {
          await api(`/api/leads/${lead.id}/lost`, { method: "POST", body: { lost_reason: reason } });
          toast("Lead marked lost with a reason.", "success");
          close();
          onSaved?.();
        } catch (err) {
          toast(err.message, "error");
        }
      });
    },
  });
  return modal;
}

export { openInteractionModal, openFollowupModal, openRecoverModal, openConvertModal, openLostModal };
