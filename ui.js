// Shared UI helpers for the LeadRescue workspace.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function attr(value) {
  return esc(value);
}

export const icons = {
  dashboard: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  leads: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.5a3 3 0 0 1 0 6"/><path d="M17.5 19.5a6 6 0 0 0-2.4-4.6"/></svg>',
  recovery: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v4l3 2"/></svg>',
  followups: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="m9 15 2 2 4-4"/></svg>',
  comms: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16v11H8l-4 4V5Z"/><path d="M8 9h8M8 12.5h5"/></svg>',
  reports: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 20h18"/><path d="M6 20V10M11 20V4M16 20v-6M21 20v-9"/></svg>',
  team: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M2.5 19a5.5 5.5 0 0 1 11 0"/><path d="M15 19a4.5 4.5 0 0 1 6.5-4"/></svg>',
  settings: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 3v2.2M12 18.8V21M4.2 7.5l1.9 1.1M17.9 15.4l1.9 1.1M4.2 16.5l1.9-1.1M17.9 8.6l1.9-1.1"/></svg>',
  plus: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  bell: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7"/><path d="M10.3 20a2 2 0 0 0 3.4 0"/></svg>',
  menu: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
  chevron: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg>',
  download: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 21h16"/></svg>',
  upload: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 17V5"/><path d="m7 9 5-5 5 5"/><path d="M4 21h16"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5"/></svg>',
  clock: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  alert: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4m0 3h.01"/><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>',
};

export const CURRENCY_SYMBOLS = {
  USD: "$", EUR: "€", GBP: "£", CAD: "CA$", AUD: "A$", AED: "AED ", INR: "₹", NGN: "₦",
  ZAR: "R", PKR: "₨", BRL: "R$", MXN: "MX$", SGD: "S$", JPY: "¥",
};

export function money(value, currency = "USD", { compact = false } = {}) {
  const num = Number(value) || 0;
  const symbol = CURRENCY_SYMBOLS[currency] || "";
  if (compact && Math.abs(num) >= 10000) {
    const units = [[1e9, "B"], [1e6, "M"], [1e3, "k"]];
    for (const [size, suffix] of units) {
      if (Math.abs(num) >= size) {
        const n = num / size;
        return `${symbol}${(Math.round(n * 10) / 10).toString()}${suffix}`;
      }
    }
  }
  return `${symbol}${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function number(value) {
  return (Number(value) || 0).toLocaleString();
}

export function pct(value, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${Number(value).toFixed(digits).replace(/\.0$/, "")}%`;
}

export function dateShort(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function dateTimeShort(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toDateInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function relative(iso) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "—";
  const mins = Math.round(diff / 60000);
  if (Math.abs(mins) < 1) return "just now";
  if (Math.abs(mins) < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (Math.abs(months) < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

export function untilText(iso) {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  const hours = diff / 3600000;
  if (hours < 0) {
    const over = Math.abs(hours);
    if (over < 24) return `${Math.round(over)}h overdue`;
    return `${Math.floor(over / 24)}d overdue`;
  }
  if (hours < 24) return `in ${Math.round(hours)}h`;
  return `in ${Math.round(hours / 24)}d`;
}

export function initials(name) {
  return String(name || "?")
    .trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "?";
}

// --- toasts / dialogs ------------------------------------------------------
export function toast(message, type = "info") {
  const root = document.getElementById("toasts");
  if (!root) return;
  const node = document.createElement("div");
  node.className = `toast ${type}`;
  node.innerHTML = `${type === "error" ? icons.alert : icons.check}<span>${esc(message)}</span>`;
  root.appendChild(node);
  setTimeout(() => {
    node.style.opacity = "0";
    node.style.transition = "opacity .2s ease";
    setTimeout(() => node.remove(), 220);
  }, type === "error" ? 6000 : 3800);
}

export function confirmDialog({ title, message, confirmLabel = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    const root = document.getElementById("modal-root");
    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    wrap.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div class="modal-head"><h2 id="confirm-title">${esc(title)}</h2></div>
        <div class="modal-body"><p style="margin:0">${message}</p></div>
        <div class="modal-foot">
          <button class="btn btn-ghost" data-cancel type="button">Cancel</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-ok type="button">${esc(confirmLabel)}</button>
        </div>
      </div>`;
    const close = (value) => { wrap.remove(); resolve(value); };
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(false); });
    wrap.querySelector("[data-cancel]").addEventListener("click", () => close(false));
    wrap.querySelector("[data-ok]").addEventListener("click", () => close(true));
    document.addEventListener("keydown", function onKey(e) {
      if (e.key === "Escape") { document.removeEventListener("keydown", onKey); close(false); }
    });
    root.appendChild(wrap);
    wrap.querySelector("[data-ok]").focus();
  });
}

export function openModal({ title, body, footer = "", wide = false, onMount }) {
  const root = document.getElementById("modal-root");
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.innerHTML = `
    <div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn close" type="button" aria-label="Close">${icons.close}</button></div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ""}
    </div>`;
  const close = () => wrap.remove();
  wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
  wrap.querySelector(".close").addEventListener("click", close);
  root.appendChild(wrap);
  if (onMount) onMount(wrap, close);
  return { wrap, close };
}

export function openDrawer({ title, subtitle = "", body, footer = "", onMount }) {
  const root = document.getElementById("modal-root");
  const backdrop = document.createElement("div");
  backdrop.className = "drawer-backdrop";
  const drawer = document.createElement("aside");
  drawer.className = "drawer";
  drawer.setAttribute("role", "dialog");
  drawer.setAttribute("aria-modal", "true");
  drawer.innerHTML = `
    <div class="drawer-head">
      <div><h2>${esc(title)}</h2>${subtitle ? `<div class="sub">${subtitle}</div>` : ""}</div>
      <button class="icon-btn close" type="button" aria-label="Close panel">${icons.close}</button>
    </div>
    <div class="drawer-body">${body}</div>
    ${footer ? `<div class="drawer-foot">${footer}</div>` : ""}`;
  const close = () => { backdrop.remove(); drawer.remove(); document.body.style.overflow = ""; };
  backdrop.addEventListener("click", close);
  drawer.querySelector(".close").addEventListener("click", close);
  const key = (e) => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", key); } };
  document.addEventListener("keydown", key);
  document.body.style.overflow = "hidden";
  root.appendChild(backdrop);
  root.appendChild(drawer);
  if (onMount) onMount(drawer, close);
  return { drawer, backdrop, close };
}

export function debounce(fn, ms = 260) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function statusBadge(key, settings) {
  const status = (settings?.statuses || []).find((s) => s.key === key);
  const label = status?.label || key;
  const kind = status?.kind || "open";
  return `<span class="badge ${esc(key)}" title="${esc(kind)} status"><span class="dot"></span>${esc(label)}</span>`;
}

export function scoreBadge(score) {
  if (!score) return "";
  return `<span class="score ${esc(score.band)}" title="Priority score — not a conversion probability">
    <span class="bar-track"><span class="bar-fill" style="width:${Math.min(100, score.score)}%"></span></span>${score.score}
  </span>`;
}

// --- charts (inline SVG, no dependencies) ---------------------------------
function niceMax(value, ticks = 4) {
  if (value <= ticks) return ticks;
  const rough = value / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  return step * ticks;
}

export function lineChart(series, { width = 640, height = 200, valueKey = "value", labelKey = "bucket", color = "#0f766e", formatY = (v) => v } = {}) {
  if (!series.length) return `<div class="empty"><p>No data for this period yet.</p></div>`;
  const pad = { l: 36, r: 12, t: 12, b: 24 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const max = niceMax(Math.max(1, ...series.map((d) => Number(d[valueKey]) || 0)));
  const step = series.length > 1 ? w / (series.length - 1) : w;
  const x = (i) => pad.l + i * step;
  const y = (v) => pad.t + h - (v / max) * h;
  const points = series.map((d, i) => `${x(i)},${y(Number(d[valueKey]) || 0)}`).join(" ");
  const area = `${pad.l},${pad.t + h} ${points} ${pad.l + w},${pad.t + h}`;
  const ticks = 4;
  let grid = "";
  for (let i = 0; i <= ticks; i++) {
    const value = (max / ticks) * i;
    const yy = y(value);
    grid += `<line class="grid-line" x1="${pad.l}" x2="${pad.l + w}" y1="${yy}" y2="${yy}"/>`;
    grid += `<text class="axis-label" x="${pad.l - 6}" y="${yy + 10}" text-anchor="end">${esc(formatY(value))}</text>`;
  }
  const labelEvery = Math.max(1, Math.ceil(series.length / 7));
  const labels = series.map((d, i) => (i % labelEvery === 0
    ? `<text class="axis-label" x="${x(i)}" y="${height - 6}" text-anchor="middle">${esc(String(d[labelKey]).slice(5))}</text>`
    : "")).join("");
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Line chart">
    ${grid}
    <polygon class="series-area" points="${area}" fill="${color}14"/>
    <polyline class="series-line" points="${points}" stroke="${color}"/>
    ${labels}
  </svg>`;
}

export function multiLineChart(series, keys, { width = 680, height = 220 } = {}) {
  if (!series.length) return `<div class="empty"><p>No data for this period yet.</p></div>`;
  const pad = { l: 34, r: 12, t: 14, b: 24 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const max = niceMax(Math.max(1, ...series.flatMap((d) => keys.map((k) => Number(d[k.key]) || 0))));
  const step = series.length > 1 ? w / (series.length - 1) : w;
  const x = (i) => pad.l + i * step;
  const y = (v) => pad.t + h - (v / max) * h;
  let grid = "";
  for (let i = 0; i <= 4; i++) {
    const value = (max / 4) * i;
    const yy = y(value);
    grid += `<line class="grid-line" x1="${pad.l}" x2="${pad.l + w}" y1="${yy}" y2="${yy}"/>`;
    grid += `<text class="axis-label" x="${pad.l - 6}" y="${yy + 10}" text-anchor="end">${Math.round(value)}</text>`;
  }
  const labelEvery = Math.max(1, Math.ceil(series.length / 7));
  const labels = series.map((d, i) => (i % labelEvery === 0
    ? `<text class="axis-label" x="${x(i)}" y="${height - 6}" text-anchor="middle">${esc(String(d.bucket).slice(5))}</text>`
    : "")).join("");
  const paths = keys.map((k) => {
    const pts = series.map((d, i) => `${x(i)},${y(Number(d[k.key]) || 0)}`).join(" ");
    return `<polyline class="series-line ${k.dashed ? "secondary" : ""}" points="${pts}" stroke="${k.color}"/>`;
  }).join("");
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Comparison chart">${grid}${paths}${labels}</svg>`;
}

export function barChart(series, { width = 420, height = 190, valueKey = "leads", labelKey = "source" } = {}) {
  if (!series.length) return `<div class="empty"><p>No lead sources recorded yet.</p></div>`;
  const pad = { l: 32, r: 8, t: 12, b: 40 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const max = niceMax(Math.max(1, ...series.map((d) => Number(d[valueKey]) || 0)));
  const slot = w / series.length;
  const barW = Math.min(42, slot * 0.5);
  let grid = "";
  for (let i = 0; i <= 3; i++) {
    const value = (max / 3) * i;
    const yy = pad.t + h - (value / max) * h;
    grid += `<line class="grid-line" x1="${pad.l}" x2="${pad.l + w}" y1="${yy}" y2="${yy}"/>`;
    grid += `<text class="axis-label" x="${pad.l - 6}" y="${yy + 10}" text-anchor="end">${Math.round(value)}</text>`;
  }
  const bars = series.map((d, i) => {
    const value = Number(d[valueKey]) || 0;
    const bh = (value / max) * h;
    const bx = pad.l + i * slot + (slot - barW) / 2;
    const by = pad.t + h - bh;
    return `<rect class="bar" x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(2, bh).toFixed(1)}" rx="3"/>
      <text class="axis-label" x="${(bx + barW / 2).toFixed(1)}" y="${(by - 5).toFixed(1)}" text-anchor="middle" fill="#334155">${value}</text>`;
  }).join("");
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Leads by source bar chart">${grid}${bars}</svg>
    <div style="display:grid;grid-template-columns:repeat(${series.length},minmax(0,1fr));gap:2px;margin-top:-30px">
      ${series.map((d) => `<div class="tiny muted" style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(d[labelKey])}">${esc(String(d[labelKey]).length > 10 ? `${String(d[labelKey]).slice(0, 9)}…` : d[labelKey])}</div>`).join("")}
    </div>`;
}

export function hBarChart(items, { labelKey = "label", valueKey = "value", suffix = "" } = {}) {
  if (!items.length) return `<div class="empty"><p>No data yet.</p></div>`;
  const max = Math.max(1, ...items.map((d) => Number(d[valueKey]) || 0));
  return `<div style="display:grid;gap:10px">${items.map((d) => {
    const value = Number(d[valueKey]) || 0;
    return `<div>
      <div class="stack-row" style="justify-content:space-between;gap:10px">
        <span class="small" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d[labelKey])}</span>
        <strong class="small num">${value}${esc(suffix)}</strong>
      </div>
      <div style="height:6px;background:#f1f4f8;border-radius:999px;margin-top:4px;overflow:hidden">
        <div style="height:100%;width:${Math.max(2, Math.round((value / max) * 100))}%;background:var(--accent);border-radius:999px"></div>
      </div>
    </div>`;
  }).join("")}</div>`;
}

export function donutChart(items, { size = 156, thickness = 18 } = {}) {
  const total = items.reduce((sum, i) => sum + (Number(i.value) || 0), 0);
  if (!total) return `<div class="empty"><p>No data yet.</p></div>`;
  const radius = (size - thickness) / 2;
  const circ = 2 * Math.PI * radius;
  let offset = 0;
  const rings = items.map((item) => {
    const frac = (Number(item.value) || 0) / total;
    const seg = `<circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="${item.color}" stroke-width="${thickness}"
      stroke-dasharray="${frac * circ} ${circ - frac * circ}" stroke-dashoffset="${-offset * circ}"
      transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
    offset += frac;
    return seg;
  }).join("");
  return `<div class="stack-row" style="gap:18px;align-items:center">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Status distribution">
      <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="#f1f4f8" stroke-width="${thickness}"/>
      ${rings}
      <text x="${size / 2}" y="${size / 2 - 2}" text-anchor="middle" font-size="20" font-weight="700" fill="#0e1726">${total}</text>
      <text x="${size / 2}" y="${size / 2 + 14}" text-anchor="middle" font-size="9" fill="#64748b">LEADS</text>
    </svg>
    <div class="donut-legend" style="flex:1">
      ${items.map((i) => `<div class="row"><span class="swatch" style="background:${i.color}"></span>${esc(i.label)}<span class="val">${i.value}</span></div>`).join("")}
    </div>
  </div>`;
}

export function csvDownloadUrl(path, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== ""));
  return `${path}${qs.toString() ? `?${qs}` : ""}`;
}
