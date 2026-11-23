import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { config } from "./src/config.js";
import { all, getSettings, one } from "./src/db.js";
import {
  AppError, clientIp, htmlEscape, matchPath, readJson, securityHeaders, sendError, sendJson, serveFile,
} from "./src/http.js";
import { currentUser, requireUser } from "./src/auth.js";
import { authRoutes } from "./src/api/auth.js";
import { leadRoutes } from "./src/api/leads.js";
import { followupRoutes } from "./src/api/followups.js";
import { recoveryRoutes } from "./src/api/recovery.js";
import { commsRoutes } from "./src/api/comms.js";
import { reportRoutes, teamRoutes } from "./src/api/reports.js";
import { settingsRoutes } from "./src/api/settings.js";
import { evaluateRecovery } from "./src/services/engine.js";

const routes = [...authRoutes, ...leadRoutes, ...followupRoutes, ...recoveryRoutes, ...commsRoutes, ...reportRoutes, ...teamRoutes, ...settingsRoutes]
  // Literal paths must win over parameterised ones (/api/leads/export.csv before /api/leads/:id).
  .sort((a, b) => {
    const score = (p) => (p.match(/:/g) || []).length;
    return score(a.path) - score(b.path);
  });

function publicPage(file, { status = 200, noindex = false } = {}) {
  const raw = fs.readFileSync(path.join(config.publicDir, file), "utf8");
  const base = config.appUrl;
  const verificationMeta = config.googleSiteVerification
    ? `<meta name="google-site-verification" content="${htmlEscape(config.googleSiteVerification)}" />`
    : "<!-- google-site-verification: add GOOGLE_SITE_VERIFICATION in the server environment or a meta tag here -->";
  const ga = config.googleAnalyticsId
    ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${htmlEscape(config.googleAnalyticsId)}"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${htmlEscape(config.googleAnalyticsId)}');</script>`
    : "";
  const html = raw
    .replaceAll("{{APP_URL}}", base)
    .replaceAll("{{GOOGLE_VERIFICATION_META}}", verificationMeta)
    .replaceAll("{{ANALYTICS}}", ga)
    .replaceAll("{{NOINDEX}}", noindex ? '<meta name="robots" content="noindex, nofollow" />' : "");
  return { html, status };
}

function sendHtml(res, html, status = 200) {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(html),
    "cache-control": "public, max-age=0, must-revalidate",
  });
  res.end(html);
}

const SITEMAP_PAGES = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
  { path: "/lead-follow-up-software", priority: "0.8", changefreq: "monthly" },
  { path: "/login", priority: "0.4", changefreq: "yearly" },
  { path: "/signup", priority: "0.6", changefreq: "yearly" },
];

function sitemapXml() {
  const today = new Date().toISOString().slice(0, 10);
  const urls = SITEMAP_PAGES.map(
    (p) => `  <url>\n    <loc>${config.appUrl}${p.path === "/" ? "/" : p.path}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`,
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function robotsTxt() {
  return `# LeadRescue — public crawling rules
User-agent: *
Allow: /
Disallow: /app
Disallow: /api/
Disallow: /invite/

Sitemap: ${config.appUrl}/sitemap.xml
`;
}

async function handleApi(req, res, url) {
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  let matched = null;
  for (const route of routes) {
    if (route.method !== req.method) continue;
    const params = matchPath(route.path, pathname);
    if (params) { matched = { route, params }; break; }
  }
  if (!matched) throw new AppError(404, "API endpoint not found.", "NOT_FOUND");

  const { route, params } = matched;
  let user = null;
  if (!route.public) user = requireUser(req, res);
  else user = currentUser(req);

  const org = user ? one("SELECT * FROM organizations WHERE id = ?", user.orgId) : null;
  if (user && !org) throw new AppError(401, "Session is no longer valid.", "UNAUTHORIZED");
  if (user) user.org = org;
  const settings = org ? getSettings(org) : null;

  if (route.capability && user) {
    const { can } = await import("./src/auth.js");
    if (!can(user, route.capability)) {
      throw new AppError(403, "Your role does not allow this action.", "FORBIDDEN");
    }
  }

  const body = ["POST", "PATCH", "PUT", "DELETE"].includes(req.method) && !route.raw
    ? await readJson(req)
    : {};

  const result = await route.handler({
    req, res, params, body, user, org, settings,
    query: Object.fromEntries(url.searchParams.entries()),
    ip: clientIp(req),
  });
  if (route.raw) return; // handler wrote the response itself
  if (!res.headersSent) sendJson(res, req.method === "POST" ? 201 : 200, result ?? { ok: true });
}

export function createServer() {
  return http.createServer(async (req, res) => {
    securityHeaders(res);
    const started = Date.now();
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(url.pathname);

    try {
      if (pathname.startsWith("/api/")) {
        if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
        await handleApi(req, res, url);
        return;
      }

      if (req.method !== "GET" && req.method !== "HEAD") {
        throw new AppError(405, "Method not allowed.", "METHOD_NOT_ALLOWED");
      }

      if (pathname === "/robots.txt") {
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" });
        return res.end(robotsTxt());
      }
      if (pathname === "/sitemap.xml") {
        res.writeHead(200, { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" });
        return res.end(sitemapXml());
      }

      // Google Search Console HTML-file verification: /google<token>.html served at the exact URL.
      const googleFile = pathname.match(/^\/google([a-zA-Z0-9_-]+)\.html$/);
      if (googleFile) {
        const staticPath = path.join(config.publicDir, pathname.slice(1));
        if (serveFile(req, res, staticPath, { cache: "public, max-age=0" })) return;
        const token = `google${googleFile[1]}.html`;
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0" });
        return res.end(`google-site-verification: ${token}`);
      }

      if (pathname === "/" || pathname === "/index.html") {
        const { html } = publicPage("index.html");
        return sendHtml(res, html);
      }
      if (pathname === "/lead-follow-up-software") {
        const { html } = publicPage("lead-follow-up-software.html");
        return sendHtml(res, html);
      }

      // Application shell (client-side routed): /login /signup /invite/:token /app/*
      const isAssetPath = Boolean(path.extname(pathname));
      if (!isAssetPath && (pathname === "/login" || pathname === "/signup" || pathname.startsWith("/invite/") || pathname === "/app" || pathname.startsWith("/app/"))) {
        const { html } = publicPage("app/index.html", { noindex: true });
        return sendHtml(res, html);
      }

      // Static assets
      const relative = pathname.replace(/^\/+/, "");
      if (relative && !relative.includes("..")) {
        const filePath = path.join(config.publicDir, relative);
        if (filePath.startsWith(config.publicDir) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath);
          if (serveFile(req, res, filePath, { cache: "public, max-age=0, must-revalidate" })) return;
        }
      }

      // Friendly 404 page for humans, proper status for crawlers.
      const { html } = publicPage("404.html", { noindex: true });
      res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      return res.end(html);
    } catch (err) {
      if (!res.headersSent) sendError(res, err);
      else res.end();
    } finally {
      if (pathname.startsWith("/api/")) {
        const ms = Date.now() - started;
        if (ms > 1500) console.log(`[slow] ${req.method} ${pathname} ${ms}ms`);
      }
    }
  });
}

export function startEngine() {
  if (!config.engineIntervalMs) return null;
  const tick = () => {
    try {
      const orgs = all("SELECT * FROM organizations");
      for (const org of orgs) {
        try {
          evaluateRecovery(org, getSettings(org), { actor: null });
        } catch (err) {
          console.error(`[engine] org ${org.id}:`, err.message);
        }
      }
    } catch (err) {
      console.error("[engine]", err.message);
    }
  };
  setTimeout(tick, 5000);
  const timer = setInterval(tick, config.engineIntervalMs);
  timer.unref?.();
  return timer;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isDirectRun) {
  const server = createServer();
  server.listen(config.port, config.host, () => {
    console.log(`LeadRescue listening on http://${config.host}:${config.port} (db: ${config.dbPath})`);
    startEngine();
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
