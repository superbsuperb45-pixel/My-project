import {
  api, esc, icons, money, number, dateShort, dateTimeShort, untilText, relative, statusBadge,
  toast, confirmDialog, openModal, toLocalInput, state, can,
} from "./view-helpers.js";
import { openLeadDrawer, openFollowupModal } from "./lead-detail.js";

const CHANNEL_LABEL = { call: "Call", email: "Email", whatsapp: "WhatsApp", sms: "SMS", meeting: "Meeting" };
const OUTCOMES = [
  ["response", "Got a response"],
  ["new_opportunity", "New opportunity"],
  ["conversion", "Converted"],
  ["no_response", "No response"],
  ["none", "Not recorded"],
];

function monthGrid(year, month, tasks) {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    cells.push(day);
  }
  const byDay = new Map();
  for (const t of tasks) {
    const key = new Date(t.due_at).toDateString();
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(t);
  }
  const today = new Date().toDateString();
  const rows = [];
  for (let w = 0; w < 6; w++) {
    rows.push(`<tr>${cells.slice(w * 7, w * 7 + 7).map((day) => {
      const list = byDay.get(day.toDateString()) || [];
      const other = day.getMonth() !== month;
      return `<td class="${other ? "other" : ""} ${day.toDateString() === today ? "today" : ""}">
        <div class="day"><span>${day.getDate()}</span>${list.length > 1 ? `<span>${list.length}</span>` : ""}</div>
        ${list.slice(0, 3).map((t) => `<button class="cal-ev ${t.status === "completed" ? "done" : t.is_overdue ? "overdue" : ""}" type="button" data-task="${t.id}" title="${esc(t.lead_name)} — ${esc(t.note || t.channel)}">${esc(new Date(t.due_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }))} ${esc(t.lead_name)}</button>`).join("")}
        ${list.length > 3 ? `<div class="tiny muted" style="margin-top:2px">+${list.length - 3} more</div>` : ""}
      </td>`;
    }).join("")}</tr>`);
  }
  return `<table class="calendar"><thead><tr>${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<th scope="col">${d}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

function taskRow(task, ctx) {
  return `<div class="card card-pad" style="display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center">
    <div style="text-align:center;min-width:64px">
      <div class="tiny muted">${new Date(task.due_at).toLocaleDateString(undefined, { month: "short" })}</div>
      <div style="font-size:1.25rem;font-weight:660;line-height:1.1">${new Date(task.due_at).getDate()}</div>
      <div class="tiny ${task.is_overdue ? "" : "muted"}" style="${task.is_overdue ? "color:var(--danger)" : ""}">${esc(new Date(task.due_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }))}</div>
    </div>
    <div style="min-width:0">
      <div class="stack-row" style="gap:8px">
        <button class="btn-link" type="button" data-open="${task.lead_id}" style="color:var(--ink);font-weight:650;font-size:.92rem">${esc(task.lead_name)}</button>
        <span class="badge outline">${esc(CHANNEL_LABEL[task.channel] || task.channel)}</span>
        ${task.is_overdue ? '<span class="badge overdue">Overdue</span>' : ""}
        ${task.status === "completed" ? '<span class="badge converted">Completed</span>' : ""}
        ${task.outcome && task.outcome !== "none" ? `<span class="badge outline">${esc(task.outcome.replaceAll("_", " "))}</span>` : ""}
      </div>
      <div class="small muted" style="margin-top:2px">${esc(task.note || "No note on this follow-up.")}</div>
      <div class="tiny muted" style="margin-top:2px">${esc(task.assignee_name || "Unassigned")} · ${task.status === "completed" ? `completed ${relative(task.completed_at)}` : `due ${untilText(task.due_at)}`} · ${statusBadge(task.lead_status, ctx.state.settings)}</div>
    </div>
    <div class="stack-row" style="justify-content:flex-end">
      ${task.status === "pending" ? `
        <button class="btn btn-accent btn-sm" type="button" data-complete="${task.id}">Complete</button>
        <button class="btn btn-ghost btn-sm" type="button" data-reschedule="${task.id}">Reschedule</button>` : `
        <button class="btn btn-ghost btn-sm" type="button" data-open="${task.lead_id}">Open lead</button>`}
    </div>
  </div>`;
}

export async function render(root, ctx) {
  const view = ctx.query.get("view") || "today";
  const monthParam = ctx.query.get("month");
  const now = monthParam ? new Date(`${monthParam}-01T00:00:00`) : new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const range = (() => {
    if (view === "calendar") {
      const from = new Date(year, month, 1);
      from.setDate(from.getDate() - 7);
      const to = new Date(year, month + 1, 7);
      return { from, to };
    }
    if (view === "upcoming") {
      const from = new Date();
      const to = new Date(Date.now() + 30 * 86400000);
      return { from, to };
    }
    if (view === "completed") {
      const from = new Date(Date.now() - 30 * 86400000);
      return { from, to: new Date() };
    }
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const to = new Date(); to.setHours(23, 59, 59, 999);
    return { from, to };
  })();

  const params = new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString() });
  if (view === "completed") params.set("status", "completed");
  const data = await api(`/api/followups?${params}`);
  const all = await api(`/api/followups`);
  const overdue = all.followups.filter((f) => f.status === "pending" && f.is_overdue);
  const todayTasks = all.followups.filter((f) => {
    if (f.status !== "pending") return false;
    const due = new Date(f.due_at);
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    return due >= start && due <= end;
  });
  const tasks = data.followups;

  root.innerHTML = `
    <div class="page-head">
      <div class="titles">
        <h1>Follow-ups</h1>
        <p>Schedule the next contact, work the daily list and record what the conversation produced.</p>
      </div>
      <div class="actions">
        <a class="btn btn-ghost btn-sm" href="/app/leads">${icons.leads} Browse leads</a>
      </div>
    </div>

    <div class="stat-grid" style="grid-template-columns:repeat(4,minmax(0,1fr))">
      <div class="stat ${overdue.length ? "danger" : ""}"><div class="label">Overdue</div><div class="value">${number(overdue.length)}</div><div class="hint">needs action now</div></div>
      <div class="stat"><div class="label">Due today</div><div class="value">${number(todayTasks.length)}</div><div class="hint">pending tasks</div></div>
      <div class="stat"><div class="label">Completed (30d)</div><div class="value">${number(all.followups.filter((f) => f.status === "completed").length)}</div><div class="hint">with recorded outcomes</div></div>
      <div class="stat accent"><div class="label">Pending total</div><div class="value">${number(all.counts.pending)}</div><div class="hint">scheduled ahead</div></div>
    </div>

    <div class="stack-row" style="justify-content:space-between;margin-bottom:14px">
      <div class="seg" role="group" aria-label="Follow-up view">
        ${[["today", "Due today"], ["overdue", "Overdue"], ["upcoming", "Next 30 days"], ["completed", "Completed"], ["calendar", "Calendar"]].map(([key, label]) => `
          <button type="button" class="${view === key ? "on" : ""}" data-view="${key}">${esc(label)}</button>`).join("")}
      </div>
      ${view === "calendar" ? `<div class="stack-row">
        <button class="btn btn-ghost btn-sm" type="button" data-month="-1" aria-label="Previous month">‹</button>
        <strong style="font-size:.85rem">${now.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</strong>
        <button class="btn btn-ghost btn-sm" type="button" data-month="1" aria-label="Next month">›</button>
      </div>` : ""}
    </div>

    <div data-body></div>`;

  const body = root.querySelector("[data-body]");

  if (view === "overdue") {
    body.innerHTML = overdue.length
      ? `<div class="grid" style="gap:10px">${overdue.map((t) => taskRow(t, ctx)).join("")}</div>`
      : `<div class="card empty"><div class="empty-icon">${icons.check}</div><h3>No overdue follow-ups</h3><p>Every scheduled follow-up is still within its due date. Keep it that way.</p></div>`;
  } else if (view === "calendar") {
    body.innerHTML = `<div class="card card-pad">
      ${monthGrid(year, month, all.followups)}
      <div class="stack-row" style="margin-top:10px;gap:14px">
        <span class="tiny muted">Click any entry to open the task.</span>
        <span class="tiny muted">Selected month: ${esc(now.toLocaleDateString(undefined, { month: "long", year: "numeric" }))}</span>
      </div>
    </div>`;
  } else {
    body.innerHTML = tasks.length
      ? `<div class="grid" style="gap:10px">${tasks.map((t) => taskRow(t, ctx)).join("")}</div>`
      : `<div class="card empty"><div class="empty-icon">${icons.followups}</div><h3>${view === "completed" ? "No completed follow-ups in the last 30 days" : "Nothing scheduled for this period"}</h3><p>Schedule a follow-up from any lead record, or from the recovery queue when a lead needs re-engagement.</p><a class="btn btn-primary btn-sm" href="/app/leads">Open leads</a></div>`;
  }

  root.querySelectorAll("[data-view]").forEach((btn) => btn.addEventListener("click", () => {
    history.replaceState({}, "", `/app/followups?view=${btn.getAttribute("data-view")}`);
    render(root, { ...ctx, query: new URLSearchParams({ view: btn.getAttribute("data-view") }) });
  }));
  root.querySelectorAll("[data-month]").forEach((btn) => btn.addEventListener("click", () => {
    const next = new Date(year, month + Number(btn.getAttribute("data-month")), 1);
    const key = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    history.replaceState({}, "", `/app/followups?view=calendar&month=${key}`);
    render(root, { ...ctx, query: new URLSearchParams({ view: "calendar", month: key }) });
  }));

  root.querySelectorAll("[data-open]").forEach((btn) => btn.addEventListener("click", async () => {
    await openLeadDrawer(btn.getAttribute("data-open"), ctx, { onChanged: () => reload() });
  }));

  const allTasks = [...all.followups];
  root.querySelectorAll("[data-complete]").forEach((btn) => btn.addEventListener("click", () => {
    const task = allTasks.find((t) => String(t.id) === btn.getAttribute("data-complete")) || tasks.find((t) => String(t.id) === btn.getAttribute("data-complete"));
    openCompleteModal(task, ctx, reload);
  }));
  root.querySelectorAll("[data-task]").forEach((btn) => btn.addEventListener("click", () => {
    const task = allTasks.find((t) => String(t.id) === btn.getAttribute("data-task"));
    if (!task) return;
    if (task.status === "pending") openCompleteModal(task, ctx, reload);
    else openLeadDrawer(task.lead_id, ctx, { onChanged: reload });
  }));
  root.querySelectorAll("[data-reschedule]").forEach((btn) => btn.addEventListener("click", () => {
    const task = allTasks.find((t) => String(t.id) === btn.getAttribute("data-reschedule"));
    openRescheduleModal(task, ctx, reload);
  }));

  async function reload() {
    await render(root, ctx);
  }

  return { title: "Follow-ups", refresh: reload };
}

function openCompleteModal(task, ctx, onDone) {
  const modal = openModal({
    title: `Complete follow-up — ${task.lead_name}`,
    body: `
      <form data-form>
        <div class="form-error" data-form-error hidden></div>
        <div class="info-box" style="margin-bottom:12px">Due ${esc(dateTimeShort(task.due_at))} · ${esc(CHANNEL_LABEL[task.channel] || task.channel)} · ${esc(task.assignee_name || "Unassigned")}</div>
        <div class="field"><label for="cp-outcome">What was the result? *</label>
          <select id="cp-outcome" name="outcome">${OUTCOMES.map(([key, label]) => `<option value="${key}">${esc(label)}</option>`).join("")}</select>
          <span class="help">The outcome updates follow-up effectiveness reports and the lead's status.</span>
        </div>
        <div class="field" style="margin-top:10px"><label for="cp-note">Notes</label><textarea id="cp-note" name="note" rows="3" placeholder="Spoke to the customer, sending a revised quote today."></textarea></div>
        <div class="field" style="margin-top:10px"><label for="cp-next">Schedule the next follow-up</label>
          <select id="cp-next" name="next_followup_days">
            <option value="">No next follow-up</option>
            <option value="2" selected>In 2 days</option>
            <option value="3">In 3 days</option>
            <option value="7">In 1 week</option>
            <option value="14">In 2 weeks</option>
            <option value="30">In 1 month</option>
          </select>
        </div>
      </form>`,
    footer: `<button class="btn btn-ghost" type="button" data-cancel>Cancel</button><button class="btn btn-accent" type="button" data-save>Complete follow-up</button>`,
    onMount(wrap, close) {
      wrap.querySelector("[data-cancel]").addEventListener("click", close);
      wrap.querySelector("[data-save]").addEventListener("click", async () => {
        const fd = Object.fromEntries(new FormData(wrap.querySelector("[data-form]")).entries());
        const btn = wrap.querySelector("[data-save]");
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner"></span> Saving…`;
        try {
          await api(`/api/followups/${task.id}/complete`, { method: "POST", body: fd });
          toast("Follow-up completed with its outcome.", "success");
          close();
          onDone?.();
        } catch (err) {
          const box = wrap.querySelector("[data-form-error]");
          box.hidden = false;
          box.textContent = err.message;
          btn.disabled = false;
          btn.innerHTML = "Complete follow-up";
        }
      });
    },
  });
  return modal;
}

function openRescheduleModal(task, ctx, onDone) {
  const modal = openModal({
    title: "Reschedule follow-up",
    body: `
      <form data-form>
        <div class="field"><label for="rs-due">New due date and time</label><input id="rs-due" name="due_at" type="datetime-local" value="${esc(toLocalInput(task.due_at))}" required /></div>
        <div class="field" style="margin-top:10px"><label for="rs-note">Reason or note</label><textarea id="rs-note" name="note" rows="2">${esc(task.note || "")}</textarea></div>
      </form>`,
    footer: `<button class="btn btn-ghost" type="button" data-cancel>Cancel</button><button class="btn btn-primary" type="button" data-save>Save</button>`,
    onMount(wrap, close) {
      wrap.querySelector("[data-cancel]").addEventListener("click", close);
      wrap.querySelector("[data-save]").addEventListener("click", async () => {
        const fd = Object.fromEntries(new FormData(wrap.querySelector("[data-form]")).entries());
        if (fd.body === "") delete fd.body;
        fd.due_at = new Date(fd.due_at).toISOString();
        try {
          await api(`/api/followups/${task.id}`, { method: "PATCH", body: fd });
          toast("Follow-up rescheduled.", "success");
          close();
          onDone?.();
        } catch (err) {
          toast(err.message, "error");
        }
      });
    },
  });
  return modal;
}
