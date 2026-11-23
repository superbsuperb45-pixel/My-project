/** Minimal RFC4180 CSV reader/writer (handles quotes, escaped quotes, CRLF, BOM). */

export function parseCsv(text) {
  const input = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ",") { row.push(field); field = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}

export function csvEscape(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers, rows) {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  return lines.join("\r\n") + "\r\n";
}

const HEADER_ALIASES = {
  name: ["name", "customer", "customer name", "full name", "contact", "lead name", "client"],
  phone: ["phone", "phone number", "mobile", "tel", "telephone", "whatsapp"],
  email: ["email", "email address", "e-mail", "mail"],
  company: ["company", "business", "business name", "organisation", "organization"],
  source: ["source", "lead source", "channel", "origin"],
  status: ["status", "lead status", "stage"],
  deal_value: ["deal value", "value", "potential value", "amount", "budget"],
  assigned_to: ["assigned to", "assigned", "owner", "employee", "sales rep", "agent"],
  received_at: ["received at", "date received", "received", "created", "date", "lead date"],
  last_contact_at: ["last contact", "last contact at", "last contacted"],
  follow_up_at: ["follow up", "follow-up", "follow up date", "followup", "next follow up"],
  notes: ["notes", "note", "comment", "comments", "message"],
  consent: ["consent", "opt in", "opt-in", "consent status"],
};

export function mapHeaders(headerRow) {
  const mapping = {};
  headerRow.forEach((raw, index) => {
    const key = String(raw || "").trim().toLowerCase();
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(key) && mapping[field] == null) mapping[field] = index;
    }
  });
  return mapping;
}

export function emptyMappingFields() {
  return Object.keys(HEADER_ALIASES);
}
