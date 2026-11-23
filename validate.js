import { bad } from "../http.js";

export function str(value, field, { max = 500, required = false, trim = true } = {}) {
  if (value == null) value = "";
  if (typeof value === "object") throw bad(`${field} must be text.`);
  let out = String(value);
  if (trim) out = out.trim();
  if (required && !out) throw bad(`${field} is required.`);
  if (out.length > max) throw bad(`${field} must be ${max} characters or fewer.`);
  return out;
}

export function emailAddr(value, field = "Email", { required = false } = {}) {
  const out = str(value, field, { max: 200 }).toLowerCase();
  if (!out) {
    if (required) throw bad(`${field} is required.`);
    return "";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(out)) throw bad(`${field} must be a valid email address.`);
  return out;
}

export function phoneNumber(value, field = "Phone", { required = false } = {}) {
  const out = str(value, field, { max: 40 });
  if (!out) {
    if (required) throw bad(`${field} is required.`);
    return "";
  }
  const digits = out.replace(/[^\d]/g, "");
  if (digits.length < 6 || digits.length > 18) throw bad(`${field} must contain between 6 and 18 digits.`);
  return out;
}

export function money(value, field = "Deal value", { min = 0, max = 1_000_000_000 } = {}) {
  if (value === "" || value == null) return 0;
  const num = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(num)) throw bad(`${field} must be a number.`);
  if (num < min) throw bad(`${field} must be at least ${min}.`);
  if (num > max) throw bad(`${field} is unrealistically large.`);
  return Math.round(num * 100) / 100;
}

export function isoDate(value, field, { required = false } = {}) {
  if (value === "" || value == null) {
    if (required) throw bad(`${field} is required.`);
    return null;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw bad(`${field} must be a valid date.`);
  return d.toISOString();
}

export function intId(value, field, { required = true, allowNull = true } = {}) {
  if (value == null || value === "" || value === 0 || value === "0") {
    if (required) throw bad(`${field} is required.`);
    return null;
  }
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) throw bad(`${field} is invalid.`);
  return num;
}

export function pickEnum(value, allowed, field, fallback = null) {
  const out = str(value, field, { max: 80 });
  if (!out) {
    if (fallback != null) return fallback;
    throw bad(`${field} is required.`);
  }
  if (!allowed.includes(out)) throw bad(`${field} must be one of: ${allowed.join(", ")}.`);
  return out;
}

export function range(value, { min = 0, max = 3650, fallback = 0 } = {}) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}
