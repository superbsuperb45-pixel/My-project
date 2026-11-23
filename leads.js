import {
  api, esc, icons, money, number, pct, dateShort, relative, untilText, statusBadge, scoreBadge,
  toast, confirmDialog, openModal, openDrawer, debounce, state, can, navigate,
} from "./view-helpers.js";
import { openLeadDrawer, openLeadForm } from "./lead-detail.js";

const SORTS = [
  { key: "priority", label: "Priority score" },
  { key: "recent", label: "Newest received" },
  { key: "followup", label: "Follow-up date" },
  { key: "value", label: "Deal value" },
  { key: "name", label: "Name" },
];

export async function render(root, ctx) {
  const q = ctx.query;
  const filters = {
    q: q.get("q") || "",
    status: q.get("status") || "",
    source: q.get("source") || "",
    assigned: q.get("assigned") || "",
    sort: q.get("sort") || "priority",
    page: Number(q.get("page") || 1),
    unanswered: q.get("unanswered") === "1",
    overdue: q.get("overdue") === "1",
    recovered: q.get("recovered") === "1",
    lost: q.get("lost") === "1",
  };

  root.innerHTML = `
    <div class="page-head">
      <div class="titles">
        <h1>Leads</h1>
        <p>Every customer inquiry with its owner, next action and priority. Scores order the work — they are not conversion probabilities.</p>
      </div>
      <div class="actions">
        <button class="btn btn-ghost btn-sm" type="button" data-import>${icons.upload} Import CSV</button>
        ${can("export:csv") ? `<a class="btn btn-ghost btn-sm" href="/api/leads/export.csv" data-export>${icons.download} Export</a>` : ""}
        <button class="btn btn-primary btn-sm" type="button" data-new>${icons.plus} Add lead</button>
      </div>
    </div>

    <section class="card">
      <div class="toolbar">
        <div class="search">${icons.search}<input type="search" placeholder="Search name, company, phone, email or notes" value="${esc(filters.q)}" data-search aria-label="Search leads" /></div>
        <select data-filter="status" aria-label="Filter by status">
          <option value="">All statuses</option>
          ${ctx.state.settings.statuses.map((s) => `<option value="${esc(s.key)}" ${filters.status === s.key ? "selected" : ""}>${esc(s.label)}</option>`).join("")}
        </select>
        <select data-filter="source" aria-label="Filter by source">
          <option value="">All sources</option>
          ${ctx.state.settings.sources.map((s) => `<option value="${esc(s)}" ${filters.source === s ? "selected" : ""}>${esc(s)}</option>`).join("")}
        </select>
        ${can("lead:read_all") ? `<select data-filter="assigned" aria-label="Filter by owner">
          <option value="">All owners</option>
          ${ctx.state.team.map((m) => `<option value="${m.id}" ${String(filters.assigned) === String(m.id) ? "selected" : ""}>${esc(m.name)}</option>`).join("")}
        </select>` : ""}
        <select data-filter="sort" aria-label="Sort leads">
          ${SORTS.map((s) => `<option value="${s.key}" ${filters.sort === s.key ? "selected" : ""}>Sort: ${esc(s.label)}</option>`).join("")}
        </select>
        <div class="spacer"></div>
        <span class="tiny muted" data-count></span>
      </div>
      <div class="stack-row" style="padding:8px 14px;border-bottom:1px solid var(--line);background:#fbfcfd;gap:6px">
        <button class="btn btn-sm ${filters.unanswered ? "btn-accent" : "btn-ghost"}" type="button" data-quick="unanswered">Unanswered</button>
        <button class="btn btn-sm ${filters.overdue ? "btn-accent" : "btn-ghost"}" type="button" data-quick="overdue">Overdue follow-up</button>
        <button class="btn btn-sm ${filters.recovered ? "btn-accent" : "btn-ghost"}" type="button" data-quick="recovered">Recovered</button>
        <button class="btn btn-sm ${filters.lost ? "btn-accent" : "btn-ghost"}" type="button" data-quick="lost">Lost</button>
      </div>
      <div data-table><div class="card-pad"><div class="skeleton" style="height:220px"></div></div></div>
    </section>`;

  const tableRoot = root.querySelector("[data-table]");
  const countEl = root.querySelector("[data-count]");

  function urlFor(next = {}) {
    const merged = { ...filters, ...next };
    const params = new URLSearchParams();
    if (merged.q) params.set("q", merged.q);
    if (merged.status) params.set("status", merged.status);
    if (merged.source) params.set("source", merged.source);
    if (merged.assigned) params.set("assigned", merged.assigned);
    if (merged.sort && merged.sort !== "priority") params.set("sort", merged.sort);
    if (merged.page > 1) params.set("page", merged.page);
    for (const key of ["unanswered", "overdue", "recovered", "lost"]) if (merged[key]) params.set(key, "1");
    return `/api/leads?${params.toString()}`;
  }

  async function load() {
    tableRoot.innerHTML = `<div class="card-pad"><div class="skeleton" style="height:220px"></div></div>`;
    try {
      const data = await api(urlFor());
      countEl.textContent = `${number(data.total)} lead${data.total === 1 ? "" : "s"}`;
      renderTable(data);
    } catch (err) {
      tableRoot.innerHTML = `<div class="empty"><h3>Could not load leads</h3><p>${esc(err.message)}</p><button class="btn btn-ghost btn-sm" type="button" data-retry>Retry</button></div>`;
      tableRoot.querySelector("[data-retry]")?.addEventListener("click", load);
    }
  }

  function renderTable(data) {
    if (!data.leads.length) {
      tableRoot.innerHTML = `<div class="empty">
        <div class="empty-icon">${icons.leads}</div>
        <h3>No leads match these filters</h3>
        <p>Adjust the filters, or import your existing pipeline from a CSV file to get started.</p>
        <button class="btn btn-primary btn-sm" type="button" data-new>Add your first lead</button>
      </div>`;
      tableRoot.querySelector("[data-new]")?.addEventListener("click", () => newLead());
      return;
    }
    tableRoot.innerHTML = `
      <div class="table-wrap">
        <table class="data">
          <thead><tr>
            <th scope="col">Customer</th><th scope="col">Status</th><th scope="col">Priority</th>
            <th scope="col">Source</th><th scope="col">Owner</th><th scope="col">Received</th>
            <th scope="col">Next follow-up</th><th scope="col" class="right">Deal value</th><th scope="col"></th>
          </tr></thead>
          <tbody>
            ${data.leads.map((lead) => `
              <tr class="clickable" data-lead="${lead.id}">
                <td><div class="cell-main">${esc(lead.name)}</div><div class="cell-sub">${esc(lead.company || lead.email || lead.phone || "")}</div></td>
                <td>${statusBadge(lead.status, ctx.state.settings)}${lead.open_recovery_flags ? ` <span class="flag" title="Open recovery flags">${lead.open_recovery_flags} flag${lead.open_recovery_flags > 1 ? "s" : ""}</span>` : ""}</td>
                <td>${scoreBadge(lead.score)}</td>
                <td class="small">${esc(lead.source || "—")}</td>
                <td class="small">${esc(lead.assignee_name || "Unassigned")}</td>
                <td class="small nowrap">${dateShort(lead.received_at)}<div class="cell-sub">${relative(lead.received_at)}</div></td>
                <td class="small nowrap">${lead.follow_up_at ? `${dateShort(lead.follow_up_at)}<div class="cell-sub" style="${lead.is_overdue_followup ? "color:var(--danger)" : ""}">${untilText(lead.follow_up_at)}</div>` : '<span class="muted">—</span>'}</td>
                <td class="right num">${money(lead.deal_value, ctx.state.org.currency)}</td>
                <td class="right"><button class="btn btn-ghost btn-sm" type="button" data-open="${lead.id}">Open</button></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="stack-row" style="padding:10px 14px;border-top:1px solid var(--line);justify-content:space-between">
        <span class="tiny muted">Page ${data.page} of ${data.pages}</span>
        <div class="stack-row">
          <button class="btn btn-ghost btn-sm" type="button" data-page="${data.page - 1}" ${data.page <= 1 ? "disabled" : ""}>Previous</button>
          <button class="btn btn-ghost btn-sm" type="button" data-page="${data.page + 1}" ${data.page >= data.pages ? "disabled" : ""}>Next</button>
        </div>
      </div>`;

    tableRoot.querySelectorAll("[data-lead]").forEach((row) => row.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      openLead(row.getAttribute("data-lead"));
    }));
    tableRoot.querySelectorAll("[data-open]").forEach((btn) => btn.addEventListener("click", () => openLead(btn.getAttribute("data-open"))));
    tableRoot.querySelectorAll("[data-page]").forEach((btn) => btn.addEventListener("click", () => {
      filters.page = Number(btn.getAttribute("data-page"));
      load();
    }));
  }

  async function openLead(id) {
    await openLeadDrawer(id, ctx, { onChanged: load });
  }

  function newLead() {
    openLeadForm({ ctx, onSaved: () => load() });
  }

  const search = root.querySelector("[data-search]");
  const runSearch = debounce(() => { filters.q = search.value.trim(); filters.page = 1; load(); }, 280);
  search.addEventListener("input", runSearch);

  root.querySelectorAll("[data-filter]").forEach((select) => select.addEventListener("change", () => {
    filters[select.getAttribute("data-filter")] = select.value;
    filters.page = 1;
    load();
  }));

  root.querySelectorAll("[data-quick]").forEach((btn) => btn.addEventListener("click", () => {
    const key = btn.getAttribute("data-quick");
    filters[key] = !filters[key];
    filters.page = 1;
    load();
    // reflect the pressed state without a full re-render
    btn.classList.toggle("btn-accent", filters[key]);
    btn.classList.toggle("btn-ghost", !filters[key]);
  }));

  root.querySelector("[data-new]")?.addEventListener("click", newLead);
  root.querySelector("[data-export]")?.addEventListener("click", (event) => {
    event.preventDefault();
    window.location.href = "/api/leads/export.csv";
    toast("Export started — your CSV download will appear in the browser.");
  });
  root.querySelector("[data-import]")?.addEventListener("click", () => openImportModal(ctx, load));

  if (q.get("new") === "1") newLead();
  await load();

  return {
    title: "Leads",
    destroy() {},
    refresh: load,
  };
}

function openImportModal(ctx, onDone) {
  let parsed = null;
  const modal = openModal({
    title: "Import leads from CSV",
    wide: true,
    body: `
      <div class="stack">
        <div class="info-box">
          Column names are detected automatically. Recognised headers include <strong>name</strong> (required), <strong>phone</strong>, <strong>email</strong>, <strong>company</strong>, <strong>source</strong>, <strong>status</strong>, <strong>deal value</strong>, <strong>assigned to</strong>, <strong>received at</strong>, <strong>last contact</strong>, <strong>follow up</strong>, <strong>notes</strong> and <strong>consent</strong>.
        </div>
        <div class="field">
          <label for="csv-file">Choose a CSV file</label>
          <input id="csv-file" type="file" accept=".csv,text/csv" />
          <span class="help">Or paste the CSV content below. Files up to 4 MB.</span>
        </div>
        <div class="field">
          <label for="csv-text">CSV content</label>
          <textarea id="csv-text" rows="7" placeholder="name,phone,email,company,source,deal value,status&#10;Amelia Grant,+15550142,amelia@example.com,Grant Interiors,Website,2400,new"></textarea>
        </div>
        <label class="checkbox"><input type="checkbox" data-skip-dupes checked /> Skip rows whose email already exists in this workspace</label>
        <div data-preview></div>
      </div>`,
    footer: `<button class="btn btn-ghost" type="button" data-cancel>Cancel</button>
      <button class="btn btn-ghost" type="button" data-preview-btn>Preview</button>
      <button class="btn btn-primary" type="button" data-import-btn disabled>Import leads</button>`,
    onMount(wrap, close) {
      const textarea = wrap.querySelector("#csv-text");
      const file = wrap.querySelector("#csv-file");
      const previewBox = wrap.querySelector("[data-preview]");
      const importBtn = wrap.querySelector("[data-import-btn]");
      const skip = wrap.querySelector("[data-skip-dupes]");
      wrap.querySelector("[data-cancel]").addEventListener("click", close);

      file.addEventListener("change", async () => {
        const f = file.files?.[0];
        if (!f) return;
        if (f.size > 4_000_000) { toast("CSV file is larger than 4 MB.", "error"); return; }
        textarea.value = await f.text();
        preview();
      });

      async function preview() {
        const csv = textarea.value;
        if (!csv.trim()) { toast("Paste CSV content or choose a file first.", "error"); return; }
        previewBox.innerHTML = `<div class="skeleton" style="height:70px"></div>`;
        importBtn.disabled = true;
        try {
          const res = await api("/api/leads/import", { method: "POST", body: { csv, dry_run: true } });
          parsed = { csv, skip: skip.checked };
          previewBox.innerHTML = `
            <div class="card card-pad">
              <div class="stack-row" style="justify-content:space-between">
                <strong>${number(res.valid)} row${res.valid === 1 ? "" : "s"} ready</strong>
                <span class="badge ${res.errors.length ? "overdue" : "converted"}">${res.error_count} problem${res.error_count === 1 ? "" : "s"}</span>
              </div>
              <p class="tiny muted" style="margin:6px 0 0">${number(res.total_rows)} data rows read · ${number(res.duplicates)} duplicate email${res.duplicates === 1 ? "" : "s"} detected</p>
              ${res.errors.length ? `<div class="divider"></div><div class="tiny" style="color:var(--danger)">${res.errors.slice(0, 8).map((e) => `Row ${e.row}: ${esc(e.message)}`).join("<br>")}${res.error_count > 8 ? `<br>…and ${res.error_count - 8} more` : ""}</div>` : ""}
              ${res.preview.length ? `<div class="divider"></div><div class="table-wrap" style="max-height:220px;overflow:auto"><table class="data"><thead><tr><th>Name</th><th>Contact</th><th>Status</th><th class="right">Value</th></tr></thead><tbody>
                ${res.preview.slice(0, 12).map((r) => `<tr><td class="cell-main">${esc(r.name)}</td><td class="small">${esc(r.email || r.phone)}</td><td class="small">${esc(r.status)}</td><td class="right num">${esc(r.deal_value || 0)}</td></tr>`).join("")}
              </tbody></table></div>` : ""}
            </div>`;
          importBtn.disabled = res.valid === 0;
        } catch (err) {
          previewBox.innerHTML = `<div class="form-error">${esc(err.message)}</div>`;
        }
      }

      wrap.querySelector("[data-preview-btn]").addEventListener("click", preview);
      importBtn.addEventListener("click", async () => {
        if (!parsed) return;
        importBtn.disabled = true;
        importBtn.innerHTML = `<span class="spinner"></span> Importing…`;
        try {
          const res = await api("/api/leads/import", { method: "POST", body: { csv: parsed.csv, skip_duplicates: skip.checked } });
          toast(`${res.imported} lead${res.imported === 1 ? "" : "s"} imported${res.skipped ? `, ${res.skipped} skipped` : ""}.`, "success");
          close();
          onDone?.();
        } catch (err) {
          toast(err.message, "error");
          importBtn.disabled = false;
          importBtn.innerHTML = "Import leads";
        }
      });
    },
  });
  return modal;
}
