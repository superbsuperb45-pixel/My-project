import {
  api, esc, icons, money, number, pct, dateShort, statusBadge, lineChart, multiLineChart,
  barChart, hBarChart, donutChart, toast, navigate, state, can,
} from "./view-helpers.js";

const RANGES = [
  { key: "7", label: "Last 7 days" },
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
  { key: "365", label: "Last 12 months" },
];

function rangeParams(days) {
  const to = new Date();
  const from = new Date(to.getTime() - Number(days) * 86400000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function statCard({ label, value, hint, tone = "", icon = "" }) {
  return `<div class="stat ${tone}">
    <div class="label">${icon}${esc(label)}</div>
    <div class="value">${value}</div>
    ${hint ? `<div class="hint">${hint}</div>` : ""}
  </div>`;
}

export async function render(root, ctx) {
  const currency = ctx.state.org?.currency || "USD";
  const days = ctx.query.get("days") || "30";
  const params = { ...rangeParams(days), granularity: ctx.query.get("granularity") || "" };
  const data = await api(`/api/dashboard?${new URLSearchParams(params)}`);
  const m = data.metrics;
  const fu = data.followup_effectiveness;

  const statusItems = data.status_breakdown
    .filter((s) => s.count > 0)
    .map((s) => ({ label: s.label, value: s.count, color: s.color || "#64748b" }));

  root.innerHTML = `
    <div class="page-head">
      <div class="titles">
        <h1>Recovery overview</h1>
        <p>Every number below is calculated from your workspace records for ${esc(dateShort(data.range.from))} – ${esc(dateShort(data.range.to))}.</p>
      </div>
      <div class="actions">
        <div class="seg" role="group" aria-label="Date range">
          ${RANGES.map((r) => `<button type="button" class="${r.key === days ? "on" : ""}" data-range="${r.key}">${esc(r.label)}</button>`).join("")}
        </div>
        ${can("export:csv") ? `<a class="btn btn-ghost btn-sm" href="/api/leads/export.csv">${icons.download} Export leads</a>` : ""}
      </div>
    </div>

    <div class="stat-grid">
      ${statCard({ label: "Total leads", value: number(m.total_leads), hint: `${number(m.new_leads)} still new` })}
      ${statCard({ label: "Unanswered", value: number(m.unanswered_leads), hint: "no first response logged", tone: m.unanswered_leads ? "danger" : "" })}
      ${statCard({ label: "Follow-ups due", value: number(m.followups_due), hint: `${number(m.overdue_followups)} overdue`, tone: m.overdue_followups ? "warn" : "" })}
      ${statCard({ label: "Recovered leads", value: number(m.recovered_leads), hint: "flags resolved as recovered", tone: "accent" })}
      ${statCard({ label: "Converted", value: number(m.converted_customers), hint: `${pct(m.conversion_rate)} conversion rate`, tone: "accent" })}
      ${statCard({ label: "Lost opportunities", value: number(m.lost_opportunities), hint: "with a recorded reason" })}
      ${statCard({ label: "Recovered revenue", value: money(m.recovered_revenue, currency, { compact: true }), hint: `${number(m.recovered_leads)} recovered leads · ${number(m.recovered_conversions)} closed as sales`, tone: "accent" })}
      ${statCard({ label: "Pipeline value", value: money(m.pipeline_value, currency, { compact: true }), hint: "open opportunities" })}
      ${statCard({ label: "Avg response", value: m.avg_response_hours == null ? "—" : `${m.avg_response_hours}h`, hint: "first reply after inquiry" })}
      ${statCard({ label: "Avg to conversion", value: m.avg_conversion_days == null ? "—" : `${m.avg_conversion_days}d`, hint: "inquiry to closed deal" })}
    </div>

    <div class="grid-2" style="grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);margin-bottom:14px">
      <section class="card">
        <div class="card-head">
          <h2>Lead acquisition and conversion</h2>
          <span class="spacer"></span>
          <div class="chart-legend"><span><i></i>New leads</span><span><i class="dash"></i>Converted</span></div>
        </div>
        <div class="card-pad">
          ${multiLineChart(data.series, [
            { key: "leads", color: "#0f766e" },
            { key: "converted", color: "#94a3b8", dashed: true },
          ])}
          <p class="tiny muted" style="margin:6px 0 0">Grouped by ${esc(data.range.granularity)}. Leads are counted by the date they were received; conversions by the date the deal closed.</p>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Pipeline by status</h2></div>
        <div class="card-pad">${donutChart(statusItems)}</div>
      </section>
    </div>

    <div class="grid-3" style="margin-bottom:14px">
      <section class="card">
        <div class="card-head">
          <h2>Recovery performance</h2>
          <span class="spacer"></span>
          <span class="badge recovered">${number(data.recovery.recovered_leads)} recovered</span>
        </div>
        <div class="card-pad">
          ${[
            { label: "Leads flagged by the engine", value: data.recovery.flagged_leads, color: "#b45309" },
            { label: "Recovered after re-engagement", value: data.recovery.recovered_leads, color: "#0f766e" },
            { label: "Recovered and closed as a sale", value: data.recovery.recovered_converted, color: "#047857" },
          ].map((step) => {
            const max = Math.max(1, data.recovery.flagged_leads);
            return `<div style="margin-bottom:12px">
              <div class="stack-row" style="justify-content:space-between">
                <span class="small">${esc(step.label)}</span><strong class="num">${number(step.value)}</strong>
              </div>
              <div style="height:8px;background:#f1f4f8;border-radius:999px;margin-top:5px;overflow:hidden">
                <div style="height:100%;width:${Math.max(2, Math.round((step.value / max) * 100))}%;background:${step.color};border-radius:999px"></div>
              </div>
            </div>`;
          }).join("")}
          <div class="divider" style="margin:10px 0"></div>
          <div class="stack-row" style="justify-content:space-between">
            <span class="tiny muted">Open flags right now</span>
            <span class="badge ${data.recovery.open_flags ? "overdue" : "recovered"}">${number(data.recovery.open_flags)}</span>
          </div>
          <p class="tiny muted" style="margin:8px 0 0">A lead counts as recovered only after a flag was resolved as recovered. Ordinary follow-ups never inflate this number.</p>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Follow-up effectiveness</h2></div>
        <div class="card-pad">
          <div class="grid-2" style="gap:10px">
            <div><div class="tiny muted">Completed</div><div style="font-size:1.3rem;font-weight:650">${number(fu.completed)}</div></div>
            <div><div class="tiny muted">Pending</div><div style="font-size:1.3rem;font-weight:650">${number(fu.pending)}</div></div>
            <div><div class="tiny muted">On time</div><div style="font-size:1.3rem;font-weight:650">${fu.on_time_rate == null ? "—" : pct(fu.on_time_rate, 0)}</div></div>
            <div><div class="tiny muted">Produced response</div><div style="font-size:1.3rem;font-weight:650">${fu.response_rate == null ? "—" : pct(fu.response_rate, 0)}</div></div>
          </div>
          <div class="divider"></div>
          <div class="tiny muted" style="margin-bottom:6px">Outcomes recorded</div>
          ${["response", "new_opportunity", "conversion", "no_response", "none"].map((key) => {
            const labels = { response: "Response", new_opportunity: "New opportunity", conversion: "Conversion", no_response: "No response", none: "Not recorded" };
            const value = fu.outcomes[key] || 0;
            return `<div class="stack-row" style="justify-content:space-between;font-size:.78rem;padding:2px 0"><span>${labels[key]}</span><strong class="num">${value}</strong></div>`;
          }).join("")}
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Leads by source</h2></div>
        <div class="card-pad">${hBarChart(data.sources.slice(0, 6).map((s) => ({ label: s.source, value: s.leads })))}</div>
      </section>
    </div>

    <div class="grid-2">
      <section class="card">
        <div class="card-head"><h2>Source performance</h2><span class="spacer"></span><a class="small" href="/app/reports">Full report →</a></div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th scope="col">Source</th><th scope="col" class="right">Leads</th><th scope="col" class="right">Converted</th><th scope="col" class="right">Rate</th><th scope="col" class="right">Revenue</th></tr></thead>
            <tbody>
              ${data.sources.length ? data.sources.slice(0, 6).map((s) => `
                <tr><td class="cell-main">${esc(s.source)}</td><td class="right num">${s.leads}</td><td class="right num">${s.converted}</td><td class="right num">${pct(s.conversion_rate)}</td><td class="right num">${money(s.revenue, currency, { compact: true })}</td></tr>`).join("")
                : `<tr><td colspan="5"><div class="empty"><p>No lead sources recorded yet.</p></div></td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Needs attention now</h2><span class="spacer"></span><button class="btn btn-ghost btn-sm" type="button" data-open-recovery>Open queue</button></div>
        <div class="card-pad">
          <div class="stack" style="gap:12px">
            <div class="stack-row" style="justify-content:space-between">
              <div><strong>${number(m.overdue_followups)}</strong> follow-ups overdue</div>
              <a class="btn btn-ghost btn-sm" href="/app/followups?due=overdue">Review</a>
            </div>
            <div class="stack-row" style="justify-content:space-between">
              <div><strong>${number(m.unanswered_leads)}</strong> leads without a first response</div>
              <a class="btn btn-ghost btn-sm" href="/app/leads?unanswered=1">Review</a>
            </div>
            <div class="stack-row" style="justify-content:space-between">
              <div><strong>${number(m.followups_due)}</strong> follow-ups due today or earlier</div>
              <a class="btn btn-ghost btn-sm" href="/app/followups?due=today">Review</a>
            </div>
          </div>
          <div class="divider"></div>
          <p class="tiny muted" style="margin:0">Recovered revenue counts leads that were flagged by the recovery engine and later converted. Ordinary pipeline value is reported separately so the two are never confused.</p>
        </div>
      </section>
    </div>`;

  root.querySelectorAll("[data-range]").forEach((btn) => btn.addEventListener("click", () => {
    ctx.navigate(`/app?days=${btn.getAttribute("data-range")}`);
  }));
  root.querySelector("[data-open-recovery]")?.addEventListener("click", () => ctx.navigate("/app/recovery"));

  return { title: "Dashboard" };
}
