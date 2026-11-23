import {
  api, esc, icons, money, number, dateShort, relative, untilText, statusBadge, scoreBadge,
  toast, confirmDialog, navigate, state, can,
} from "./view-helpers.js";
import { openLeadDrawer, openInteractionModal, openRecoverModal, openFollowupModal } from "./lead-detail.js";

const RULE_HINTS = {
  no_response: "No first response logged within your threshold",
  no_contact: "No logged contact for several days",
  stalled_interest: "Showed interest but no decision",
  overdue_followup: "Follow-up date has passed",
  inactive: "No activity on the record",
};

let visibleCount = 10;

export async function render(root, ctx) {
  const tab = ctx.query.get("tab") || "queue";
  const data = await api("/api/recovery");
  const ruleSettings = data.rules;

  const card = (entry) => {
    const lead = entry.lead;
    const topFlag = entry.flags[0];
    return `
      <article class="card" style="border-left:3px solid ${entry.top_severity >= 3 ? "#b42318" : entry.top_severity === 2 ? "#b45309" : "#94a3b8"}">
        <div class="card-pad">
          <div class="stack-row" style="justify-content:space-between;align-items:flex-start">
            <div style="min-width:0">
              <button class="btn-link" type="button" data-open="${lead.id}" style="font-size:.95rem;font-weight:650;color:var(--ink)">${esc(lead.name)}</button>
              <div class="small muted">${esc(lead.company || lead.email || lead.phone || "")} · ${esc(lead.source || "no source")} · ${money(lead.deal_value, ctx.state.org.currency)}</div>
            </div>
            <div class="stack-row">${statusBadge(lead.status, ctx.state.settings)}${scoreBadge(entry.score)}</div>
          </div>
          <div style="margin-top:10px;display:grid;gap:7px">
            ${entry.flags.map((f) => `<div style="background:#fbfcfd;border:1px solid var(--line);border-radius:8px;padding:8px 10px">
              <div class="stack-row" style="justify-content:space-between">
                <strong style="font-size:.8rem">${esc(f.label)}</strong>
                <span class="badge ${f.severity >= 3 ? "overdue" : f.severity === 2 ? "follow_up" : "outline"}">${f.severity >= 3 ? "Critical" : f.severity === 2 ? "High" : "Monitor"}</span>
              </div>
              <div class="tiny" style="margin-top:3px;color:var(--ink-2)">${esc(f.recommendation)}</div>
              <div class="tiny muted" style="margin-top:2px">Flagged ${relative(f.detected_at)}</div>
            </div>`).join("")}
          </div>
          <div class="stack-row" style="margin-top:10px;justify-content:space-between">
            <span class="tiny muted">${esc(entry.assignee_name || "Unassigned")} · last contact ${lead.last_contact_at ? relative(lead.last_contact_at) : "never"} · next follow-up ${lead.follow_up_at ? untilText(lead.follow_up_at) : "none"}</span>
            <div class="stack-row">
              <button class="btn btn-ghost btn-sm" type="button" data-contact="${lead.id}">Log contact</button>
              <button class="btn btn-ghost btn-sm" type="button" data-schedule="${lead.id}">Schedule</button>
              <button class="btn btn-ghost btn-sm" type="button" data-dismiss="${lead.id}">Dismiss flags</button>
              <button class="btn btn-accent btn-sm" type="button" data-recover="${lead.id}">Mark recovered</button>
            </div>
          </div>
        </div>
      </article>`;
  };

  root.innerHTML = `
    <div class="page-head">
      <div class="titles">
        <h1>Recovery queue</h1>
        <p>Leads that broke one of your recovery rules. Rules run continuously and again every time you open this page.</p>
      </div>
      <div class="actions">
        <button class="btn btn-ghost btn-sm" type="button" data-run>${icons.recovery} Re-evaluate now</button>
        <a class="btn btn-ghost btn-sm" href="/app/settings#recovery">Configure rules</a>
      </div>
    </div>

    <div class="stat-grid" style="grid-template-columns:repeat(4,minmax(0,1fr))">
      <div class="stat danger"><div class="label">Flagged leads</div><div class="value">${number(data.counts.flagged_leads)}</div><div class="hint">${number(data.counts.open_flags)} open flags</div></div>
      <div class="stat accent"><div class="label">Recovered (all time)</div><div class="value">${number(data.counts.recovered)}</div><div class="hint">genuinely re-engaged</div></div>
      <div class="stat"><div class="label">Lost opportunities</div><div class="value">${number(data.counts.lost)}</div><div class="hint">with recorded reasons</div></div>
      <div class="stat"><div class="label">Active rules</div><div class="value">5</div><div class="hint">thresholds editable in settings</div></div>
    </div>

    <div class="card card-pad" style="margin-bottom:14px">
      <div class="stack-row" style="justify-content:space-between;align-items:flex-start">
        <div>
          <strong style="font-size:.88rem">Your thresholds</strong>
          <div class="small muted" style="margin-top:3px">
            First response within <strong>${ruleSettings.no_response_hours}h</strong> ·
            contact at least every <strong>${ruleSettings.no_contact_days} days</strong> ·
            interested leads decided within <strong>${ruleSettings.stalled_interest_days} days</strong> ·
            inactive after <strong>${ruleSettings.inactive_days} days</strong>
          </div>
        </div>
        <a class="btn btn-ghost btn-sm" href="/app/settings#recovery">Edit thresholds</a>
      </div>
      <div class="divider"></div>
      <div class="stack-row" style="gap:8px">
        ${data.summary.length ? data.summary.map((s) => `<span class="badge outline" title="${esc(RULE_HINTS[s.rule_key] || "")}">${esc(s.rule_label)} · ${s.count}</span>`).join("") : '<span class="tiny muted">No open flags. Every rule is satisfied right now.</span>'}
      </div>
    </div>

    <div class="tabs" role="tablist">
      <button type="button" class="${tab === "queue" ? "on" : ""}" data-tab="queue">Queue (${data.counts.flagged_leads})</button>
      <button type="button" class="${tab === "lost" ? "on" : ""}" data-tab="lost">Lost opportunities (${data.counts.lost})</button>
      <button type="button" class="${tab === "history" ? "on" : ""}" data-tab="history">Recovery history (${data.history.length})</button>
    </div>

    <div data-panel="queue" ${tab === "queue" ? "" : "hidden"}>
      ${data.queue.length ? `<div class="grid" style="gap:12px">${data.queue.slice(0, visibleCount).map(card).join("")}</div>
        ${data.queue.length > visibleCount ? `<div style="text-align:center;margin-top:12px"><button class="btn btn-ghost btn-sm" type="button" data-more>Show ${Math.min(10, data.queue.length - visibleCount)} more of ${data.queue.length - visibleCount} remaining</button></div>` : ""}`
        : `<div class="card empty"><div class="empty-icon">${icons.check}</div><h3>Nothing neglected right now</h3><p>Every lead satisfies your recovery rules. New flags appear here automatically as leads age without contact.</p><a class="btn btn-ghost btn-sm" href="/app/leads">Review all leads</a></div>`}
    </div>

    <div data-panel="lost" ${tab === "lost" ? "" : "hidden"}>
      <div class="card">
        <div class="card-head"><h2>Lost opportunities</h2><span class="spacer"></span><span class="small muted">A lost lead can still be recovered — reopen it with a logged contact.</span></div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th scope="col">Customer</th><th scope="col">Lost reason</th><th scope="col">Value</th><th scope="col">Owner</th><th scope="col">Lost</th><th scope="col"></th></tr></thead>
            <tbody>
              ${data.lost_opportunities.length ? data.lost_opportunities.map((l) => `<tr>
                <td><div class="cell-main">${esc(l.name)}</div><div class="cell-sub">${esc(l.company || l.email || l.phone || "")}</div></td>
                <td class="small">${esc(l.lost_reason || "No reason recorded")}</td>
                <td class="num">${money(l.deal_value, ctx.state.org.currency)}</td>
                <td class="small">${esc(l.assignee_name || "Unassigned")}</td>
                <td class="small nowrap">${dateShort(l.lost_at || l.updated_at)}</td>
                <td class="right"><button class="btn btn-ghost btn-sm" type="button" data-open="${l.id}">Open</button></td>
              </tr>`).join("") : `<tr><td colspan="6"><div class="empty"><p>No lost leads recorded. When you close a lead as lost, its reason appears here.</p></div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div data-panel="history" ${tab === "history" ? "" : "hidden"}>
      <div class="card">
        <div class="card-head"><h2>Recovery history</h2><span class="spacer"></span><span class="small muted">How each flag was closed.</span></div>
        <div class="card-pad">
          ${data.history.length ? `<div class="timeline">${data.history.map((h) => `<div class="tl-item">
            <div><div class="tl-dot ${h.resolution === "recovered" ? "" : "done"}"></div></div>
            <div class="tl-body">
              <div class="when">${esc(dateShort(h.resolved_at))} · ${esc(h.lead_name)}</div>
              <div style="font-weight:600">${esc(h.rule_label)} — ${esc(String(h.resolution || "resolved").replaceAll("_", " "))}</div>
              <div class="text">${esc(h.recommendation)}</div>
            </div>
          </div>`).join("")}</div>` : '<div class="empty"><p>No resolved recovery flags yet.</p></div>'}
        </div>
      </div>
    </div>`;

  root.querySelectorAll("[data-tab]").forEach((btn) => btn.addEventListener("click", () => {
    const key = btn.getAttribute("data-tab");
    root.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("on", b === btn));
    root.querySelectorAll("[data-panel]").forEach((p) => { p.hidden = p.getAttribute("data-panel") !== key; });
    history.replaceState({}, "", `/app/recovery?tab=${key}`);
  }));

  root.querySelectorAll("[data-open]").forEach((btn) => btn.addEventListener("click", async () => {
    await openLeadDrawer(btn.getAttribute("data-open"), ctx, { onChanged: () => refresh() });
  }));

  root.querySelectorAll("[data-contact]").forEach((btn) => btn.addEventListener("click", () => {
    const entry = data.queue.find((e) => String(e.lead.id) === btn.getAttribute("data-contact"));
    openInteractionModal(entry.lead, ctx, () => refresh());
  }));
  root.querySelectorAll("[data-schedule]").forEach((btn) => btn.addEventListener("click", () => {
    const entry = data.queue.find((e) => String(e.lead.id) === btn.getAttribute("data-schedule"));
    openFollowupModal(entry.lead, ctx, () => refresh());
  }));
  root.querySelectorAll("[data-recover]").forEach((btn) => btn.addEventListener("click", async () => {
    const entry = data.queue.find((e) => String(e.lead.id) === btn.getAttribute("data-recover"));
    const ok = await confirmDialog({
      title: "Mark this lead recovered?",
      message: `Only do this if <strong>${esc(entry.lead.name)}</strong> genuinely came back into an active conversation. The flags will close as recovered and the recovered value is recorded separately from new pipeline.`,
      confirmLabel: "Mark recovered",
    });
    if (!ok) return;
    try {
      await api(`/api/leads/${entry.lead.id}/recover`, { method: "POST", body: { recovered_value: entry.lead.deal_value } });
      toast("Lead marked recovered.", "success");
      refresh();
    } catch (err) {
      toast(err.message, "error");
    }
  }));
  root.querySelectorAll("[data-dismiss]").forEach((btn) => btn.addEventListener("click", async () => {
    const leadId = btn.getAttribute("data-dismiss");
    const ok = await confirmDialog({
      title: "Dismiss open flags?",
      message: "Dismissing keeps the lead in your pipeline but closes the recovery flags without logging contact. The rules will flag it again if the condition persists.",
      confirmLabel: "Dismiss flags",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/recovery/resolve-lead/${leadId}`, { method: "POST", body: { resolution: "dismissed" } });
      toast("Flags dismissed.");
      refresh();
    } catch (err) {
      toast(err.message, "error");
    }
  }));

  root.querySelector("[data-more]")?.addEventListener("click", () => {
    visibleCount += 10;
    render(root, ctx);
  });

  root.querySelector("[data-run]")?.addEventListener("click", async () => {
    try {
      const res = await api("/api/recovery/run", { method: "POST" });
      toast(`Rules evaluated across ${res.evaluated} leads. ${res.created} new flag(s).`, "success");
      refresh();
    } catch (err) {
      toast(err.message, "error");
    }
  });

  async function refresh() {
    const next = await api("/api/recovery");
    const scroll = window.scrollY;
    await render(root, ctx);
    window.scrollTo(0, scroll);
  }

  return { title: "Recovery queue", refresh };
}
