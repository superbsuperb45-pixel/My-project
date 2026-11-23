import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

export class AppError extends Error {
  constructor(status, message, code = "ERROR", details = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const bad = (msg, code = "VALIDATION", details = null) => new AppError(400, msg, code, details);
export const unauthorized = (msg = "Please sign in to continue.") => new AppError(401, msg, "UNAUTHORIZED");
export const forbidden = (msg = "You do not have permission to do that.") => new AppError(403, msg, "FORBIDDEN");
export const notFound = (msg = "Not found.") => new AppError(404, msg, "NOT_FOUND");
export const conflict = (msg, code = "CONFLICT") => new AppError(409, msg, code);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
  ".pdf": "application/pdf",
};

export function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    ...headers,
  });
  res.end(body);
}

export function sendError(res, err) {
  const status = err?.status && Number.isInteger(err.status) ? err.status : 500;
  const payload = {
    error: {
      code: err.code || "INTERNAL",
      message: status === 500 ? "Something went wrong on our side. Please try again." : err.message,
    },
  };
  if (err.details) payload.error.details = err.details;
  if (status === 500) console.error("[leadrescue] unhandled:", err);
  sendJson(res, status, payload);
}

export async function readJson(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new AppError(413, "Request body is too large.", "PAYLOAD_TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(bad("Request body must be valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

export function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function setCookie(req, res, name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opts.path || "/"}`);
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.httpOnly !== false) parts.push("HttpOnly");
  parts.push(`SameSite=${opts.sameSite || "Lax"}`);
  const secure = opts.secure ?? config.secureCookies;
  if (secure) parts.push("Secure");
  const existing = res.getHeader("set-cookie");
  const list = existing ? (Array.isArray(existing) ? existing.slice() : [existing]) : [];
  list.push(parts.join("; "));
  res.setHeader("set-cookie", list);
}

export function clearCookie(req, res, name) {
  setCookie(req, res, name, "", { maxAge: 0, httpOnly: true });
}

export function clientIp(req) {
  if (config.trustProxy) {
    const fwd = req.headers["x-forwarded-for"];
    if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "";
}

export function serveFile(req, res, filePath, { cache = "public, max-age=300", downloadName = null } = {}) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  const headers = {
    "content-type": type,
    "content-length": stat.size,
    "cache-control": cache,
  };
  if (downloadName) headers["content-disposition"] = `attachment; filename="${downloadName.replace(/"/g, "")}"`;
  res.writeHead(200, headers);
  if (req.method === "HEAD") return res.end(), true;
  fs.createReadStream(filePath).pipe(res);
  return true;
}

// Simple path matcher: "/api/leads/:id" against "/api/leads/12"
export function matchPath(pattern, pathname) {
  const p = pattern.split("/").filter(Boolean);
  const s = pathname.split("/").filter(Boolean);
  if (p.length !== s.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

export function securityHeaders(res) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "SAMEORIGIN");
  res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  res.setHeader("permissions-policy", "geolocation=(), microphone=(), camera=()");
}

export function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
