import { api, esc, icons, money, number, pct, dateShort, toast, can, state } from "./view-helpers.js";

function daysAgo(days) {
  const d = new Date(Date.now() - days * 86400000);
  return d.toISOString().slice(0, 10);
}

export async function render(root, ctx) {
  const from = ctx.query.get("from") || daysAgo(90);
  const to = ctx.query.get("to") || new Date().toISOString().slice(0, 10);
  const data = await api(`/api/reports?${new URLSearchParams({ from, to })}`);
  const m = data.metrics;
  const currency = ctx.state.org.currency;
  const scored = data.employees.filter((e) => e.on_time_rate != null);
  const onTimeAvg = scored.length ? scored.reduce((a, e) => a + e.on_time_rate, 0) / scored.length : null;
  const completedTotal = data.employees.reduce((a, e) => a + (e.followups_completed || 0), 0);

  root.innerHTML = `
    <div class="page-head">
      <div class="titles">
        <h1>Reports</h1>
        <p>Where leads come from, which ones were neglected, what was recovered and how the team performed.</p>
      </div>
      <div class="actions">
        ${can("export:csv") ? `
          <button class="btn btn-ghost btn-sm" type="button" data-export="summary">${icons.download} Summary CSV</button>
          <button class="btn btn-ghost btn-sm" type="button" data-export="employees">${icons.download} Employees CSV</button>
          <button class="btn btn-ghost btn-sm" type="button" data-export="sources">${icons.download} Sources CSV</button>` : ""}
      </div>
    </div>

    <div class="card card-pad" style="margin-bottom:14px">
      <form class="stack-row" data-range-form>
        <div class="field" style="max-width:180px"><label for="rp-from">From</label><input id="rp-from" type="date" name="from" value="${esc(from)}" /></div>
        <div class="field" style="max-width:180px"><label for="rp-to">To</label><input id="rp-to" type="date" name="to" value="${esc(to)}" /></div>
        <div class="field" style="align-self:end"><button class="btn btn-primary btn-sm" type="submit">Apply range</button></div>
        <div class="field" style="align-self:end"><div class="stack-row">
          ${[[7, "7 days"], [30, "30 days"], [90, "90 days"], [365, "12 months"]].map(([d, l]) => `<button class="btn btn-ghost btn-sm" type="button" data-quick="${d}">${l}</button>`).join("")}
        </div></div>
        <div style="margin-left:auto;align-self:end" class="tiny muted">Showing leads received ${esc(dateShort(data.range.from))} – ${esc(dateShort(data.range.to))}</div>
      </form>
    </div>

    <div class="stat-grid" style="grid-template-columns:repeat(4,minmax(0,1fr))">
      <div class="stat"><div class="label">Leads received</div><div class="value">${number(m.total_leads)}</div><div class="hint">in the selected period</div></div>
      <div class="stat danger"><div class="label">Leads neglected</div><div class="value">${number(m.neglected_leads)}</div><div class="hint">flagged by recovery rules</div></div>
      <div class="stat accent"><div class="label">Recovered leads</div><div class="value">${number(m.recovered_leads_in_range)}</div><div class="hint">marked recovered in range</div></div>
      <div class="stat"><div class="label">Converted customers</div><div class="value">${number(m.converted_customers)}</div><div class="hint">${pct(m.conversion_rate)} conversion</div></div>
      <div class="stat accent"><div class="label">Recovered revenue</div><div class="value">${money(m.recovered_revenue_in_range, currency, { compact: true })}</div><div class="hint">attributed to recovered leads</div></div>
      <div class="stat"><div class="label">Lost opportunities</div><div class="value">${number(m.lost_leads)}</div><div class="hint">closed as lost</div></div>
      <div class="stat"><div class="label">Avg response time</div><div class="value">${m.avg_response_hours == null ? "—" : `${m.avg_response_hours}h`}</div><div class="hint">inquiry to first reply</div></div>
      <div class="stat"><div class="label">Avg time to conversion</div><div class="value">${m.avg_conversion_days_all == null ? "—" : `${m.avg_conversion_days_all}d`}</div><div class="hint">inquiry to closed deal</div></div>
    </div>

    <div class="stack" style="gap:14px;margin-bottom:14px">
      <section class="card">
        <div class="card-head"><h2>Employee performance</h2></div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th scope="col">Employee</th><th scope="col" class="right">Leads</th><th scope="col" class="right">Converted</th><th scope="col" class="right">Rate</th><th scope="col" class="right">Recovered</th><th scope="col" class="right">Revenue</th><th scope="col" class="right">Avg response</th></tr></thead>
            <tbody>
              ${data.employees.length ? data.employees.map((e) => `<tr>
                <td style="min-width:130px"><div class="cell-main">${esc(e.name)}</div><div class="cell-sub">${esc(e.role)}</div></td>
                <td class="right num">${e.leads}</td>
                <td class="right num">${e.converted}</td>
                <td class="right num">${pct(e.conversion_rate)}</td>
                <td class="right num">${e.recovered}</td>
                <td class="right num">${money(e.revenue, currency)}</td>
                <td class="right num">${e.avg_response_hours == null ? "—" : `${e.avg_response_hours}h`}</td>
              </tr>`).join("") : `<tr><td colspan="7"><div class="empty"><p>No team activity in this period.</p></div></td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Lead source performance</h2></div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th scope="col">Source</th><th scope="col" class="right">Leads</th><th scope="col" class="right">Contacted</th><th scope="col" class="right">Converted</th><th scope="col" class="right">Rate</th><th scope="col" class="right">Revenue</th><th scope="col" class="right">Avg response</th></tr></thead>
            <tbody>
              ${data.sources.length ? data.sources.map((s) => `<tr>
                <td class="cell-main" style="min-width:110px">${esc(s.source)}</td>
                <td class="right num">${s.leads}</td>
                <td class="right num">${s.contacted}</td>
                <td class="right num">${s.converted}</td>
                <td class="right num">${pct(s.conversion_rate)}</td>
                <td class="right num">${money(s.revenue, currency)}</td>
                <td class="right num">${s.avg_response_hours == null ? "—" : `${s.avg_response_hours}h`}</td>
              </tr>`).join("") : `<tr><td colspan="7"><div class="empty"><p>No leads in this period.</p></div></td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <div class="grid-2">
      <section class="card">
        <div class="card-head"><h2>Follow-up effectiveness</h2><span class="spacer"></span><span class="small muted">completed follow-ups in range</span></div>
        <div class="card-pad">
          <div class="grid-2" style="gap:12px">
            <div><div class="tiny muted">On-time completion</div><div style="font-size:1.4rem;font-weight:650">${onTimeAvg == null ? "—" : pct(Math.round(onTimeAvg), 0)}</div></div>
            <div><div class="tiny muted">Completed follow-ups</div><div style="font-size:1.4rem;font-weight:650">${number(completedTotal)}</div></div>
          </div>
          <div class="divider"></div>
          <p class="tiny muted" style="margin:0">On-time rate is averaged across employees with completed follow-ups. Logging an outcome on every follow-up is what makes this report meaningful.</p>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Lost lead reasons</h2></div>
        <div class="card-pad">
          ${data.lost_reasons.length ? data.lost_reasons.map((r) => {
            const max = Math.max(...data.lost_reasons.map((x) => x.count));
            return `<div style="margin-bottom:9px">
              <div class="stack-row" style="justify-content:space-between"><span class="small">${esc(r.reason)}</span><strong class="small num">${r.count}</strong></div>
              <div style="height:6px;background:#f1f4f8;border-radius:999px;margin-top:4px"><div style="height:6px;border-radius:999px;background:var(--accent);width:${Math.round((r.count / max) * 100)}%"></div></div>
            </div>`;
          }).join("") : `<div class="empty"><p>No lost leads with reasons yet. Lost reasons help you see the pattern behind the leak.</p></div>`}
        </div>
      </section>
    </div>`;

  root.querySelector("[data-range-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const fd = new FormData(event.target);
    ctx.navigate(`/app/reports?from=${fd.get("from")}&to=${fd.get("to")}`);
  });
  root.querySelectorAll("[data-quick]").forEach((btn) => btn.addEventListener("click", () => {
    const days = btn.getAttribute("data-quick");
    ctx.navigate(`/app/reports?from=${daysAgo(Number(days))}&to=${new Date().toISOString().slice(0, 10)}`);
  }));
  root.querySelectorAll("[data-export]").forEach((btn) => btn.addEventListener("click", () => {
    const type = btn.getAttribute("data-export");
    window.location.href = `/api/reports/export.csv?type=${type}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    toast(`Preparing ${type} report CSV…`);
  }));

  return { title: "Reports" };
}
