/**
 * Browser test: signs in to the demo workspace, visits every page, opens a
 * lead drawer, exercises a filter, and captures screenshots + console errors.
 * Usage: node test/ui-check.mjs http://localhost:3111
 */
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("/home/user/.npm-global/lib/node_modules/playwright");

const BASE = process.argv[2] || "http://localhost:3111";
const OUT = process.argv[3] || "files/screens";

fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console: ${msg.text()}`); });
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
page.on("requestfailed", (req) => errors.push(`requestfailed: ${req.url()} ${req.failure()?.errorText}`));
page.on("response", (res) => {
  if (res.status() >= 400) errors.push(`http ${res.status()}: ${res.url()}`);
});

async function shot(name, fullPage = true) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage });
  console.log(`  shot ${name}`);
}

try {
  // marketing homepage
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await shot("01-homepage", false);
  await page.click('[data-panel-btn="followups"]');
  await page.waitForTimeout(250);
  const tabVisible = await page.isVisible(".panel-followups");
  console.log(`  preview tab switches: ${tabVisible}`);
  await page.click('[data-panel-btn="recovery"]');

  // login
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await shot("02-login", false);
  await page.fill("#email", "alex@northwind.example");
  await page.fill("#password", "LeadRescue2026!");
  await Promise.all([page.waitForURL("**/app**"), page.click('button[type="submit"]')]);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(700);
  await shot("03-dashboard", true);

  const statCards = await page.locator(".stat").count();
  console.log(`  dashboard stat cards: ${statCards}`);
  const svgCharts = await page.locator("svg.chart").count();
  console.log(`  dashboard charts: ${svgCharts}`);

  // leads
  await page.goto(`${BASE}/app/leads`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await shot("04-leads", true);
  const rowCount = await page.locator("tr[data-lead]").count();
  console.log(`  lead rows: ${rowCount}`);
  if (rowCount) {
    await page.locator("tr[data-lead]").first().click();
    await page.waitForTimeout(500);
    await shot("05-lead-drawer", false);
    const factors = await page.locator(".factor").count();
    console.log(`  score factors in drawer: ${factors}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }

  // search interaction
  await page.fill("[data-search]", "Nadia");
  await page.waitForTimeout(700);
  const filtered = await page.locator("tr[data-lead]").count();
  console.log(`  rows after search: ${filtered}`);

  // recovery
  await page.goto(`${BASE}/app/recovery`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await shot("06-recovery", true);
  console.log(`  recovery cards: ${await page.locator("article.card").count()}`);

  // follow-ups calendar
  await page.goto(`${BASE}/app/followups?view=calendar`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await shot("07-followup-calendar", true);
  await page.goto(`${BASE}/app/followups`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await shot("08-followups", true);

  // communications
  await page.goto(`${BASE}/app/communications`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await shot("09-communications", true);
  await page.goto(`${BASE}/app/communications?tab=templates`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await shot("10-templates", true);

  // reports
  await page.goto(`${BASE}/app/reports`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await shot("11-reports", true);

  // team
  await page.goto(`${BASE}/app/team`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await shot("12-team", true);

  // settings
  await page.goto(`${BASE}/app/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await shot("13-settings", true);

  // account
  await page.goto(`${BASE}/app/account`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await shot("14-account", true);

  // create-lead modal
  await page.goto(`${BASE}/app/leads?new=1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  const modalVisible = await page.isVisible(".modal");
  console.log(`  new lead modal opens: ${modalVisible}`);
  await shot("15-new-lead-modal", false);
  await page.keyboard.press("Escape");
  await page.locator(".modal-backdrop").click({ position: { x: 5, y: 5 } }).catch(() => {});

  // mobile views
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const mp = await mobile.newPage();
  await mp.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await mp.screenshot({ path: path.join(OUT, "16-homepage-mobile.png"), fullPage: false });
  await mp.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await mp.fill("#email", "alex@northwind.example");
  await mp.fill("#password", "LeadRescue2026!");
  await Promise.all([mp.waitForURL("**/app**"), mp.click('button[type="submit"]')]);
  await mp.waitForTimeout(900);
  await mp.screenshot({ path: path.join(OUT, "17-dashboard-mobile.png"), fullPage: false });
  await mp.click("[data-menu-toggle]");
  await mp.waitForTimeout(350);
  await mp.screenshot({ path: path.join(OUT, "18-mobile-nav.png"), fullPage: false });
  await mp.goto(`${BASE}/app/leads`, { waitUntil: "networkidle" });
  await mp.waitForTimeout(700);
  await mp.screenshot({ path: path.join(OUT, "19-leads-mobile.png"), fullPage: false });
  await mobile.close();

  // public 404
  await page.goto(`${BASE}/does-not-exist`, { waitUntil: "networkidle" });
  const title404 = await page.title();
  console.log(`  404 page title: ${title404}`);
} catch (err) {
  errors.push(`script: ${err.message}`);
} finally {
  await browser.close();
}

const unexpected = errors.filter((e) => !e.includes("/api/auth/me") && !e.includes("favicon.ico"));
console.log(`\nConsole/page errors: ${unexpected.length} unexpected, ${errors.length - unexpected.length} expected (auth probe / favicon)`);
for (const e of unexpected.slice(0, 25)) console.log(`  ! ${e}`);
process.exit(unexpected.length ? 1 : 0);
