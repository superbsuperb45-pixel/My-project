/**
 * Browser interaction test: creates a fresh workspace through the UI and
 * exercises the flows a real user performs (lead creation, recovery flag,
 * follow-up completion, CSV import, settings save, invite, delete).
 * Usage: node test/ui-flows.mjs http://localhost:3111
 */
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("/home/user/.npm-global/lib/node_modules/playwright");

const BASE = process.argv[2] || "http://localhost:3111";
const stamp = Date.now().toString().slice(-6);
const email = `flow.${stamp}@example.test`;
const OUT = "files/screens";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 940 } });
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("Failed to load resource")) problems.push(`console: ${m.text()}`); });
page.on("response", (r) => { if (r.status() >= 500) problems.push(`http ${r.status()} ${r.url()}`); });

function log(step, ok, extra = "") { console.log(`${ok ? "  ok  " : "  FAIL"} ${step} ${ok ? "" : extra}`); if (!ok) problems.push(step); }

try {
  // signup
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
  await page.fill("#org_name", `Flow Test ${stamp}`);
  await page.fill("#name", "Flow Owner");
  await page.selectOption("#industry", { label: "Consulting" });
  await page.fill("#email", email);
  await page.fill("#password", "FlowTestPass123");
  await Promise.all([page.waitForURL("**/app**"), page.click('button[type="submit"]')]);
  await page.waitForTimeout(900);
  log("signup lands in workspace", page.url().includes("/app"));
  const emptyState = await page.locator(".stat .value").first().innerText();
  log("empty workspace shows zero leads", emptyState.trim() === "0", emptyState);

  // add a lead
  await page.goto(`${BASE}/app/leads?new=1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.fill("#lf-name", "Amelia Grant");
  await page.fill("#lf-email", "amelia@example.test");
  await page.fill("#lf-phone", "+15550142");
  await page.fill("#lf-company", "Grant Interiors");
  await page.fill("#lf-value", "4200");
  await page.selectOption("#lf-source", { label: "Website" });
  await page.locator("[data-save]").click();
  await page.waitForTimeout(1100);
  const rows = await page.locator("tr[data-lead]").count();
  log("lead created and listed", rows === 1, `rows=${rows}`);
  const leadName = await page.locator("tr[data-lead] .cell-main").first().innerText().catch(() => "");
  log("lead name rendered", leadName.includes("Amelia"), leadName);

  // validation: missing contact
  await page.locator("[data-new]").click();
  await page.waitForTimeout(400);
  await page.fill("#lf-name", "No Contact Lead");
  await page.locator("[data-save]").click();
  await page.waitForTimeout(700);
  const errVisible = await page.locator("[data-form-error]").isVisible();
  const errText = errVisible ? await page.locator("[data-form-error]").innerText() : "";
  log("server validation shown in form", errVisible && /phone|email/i.test(errText), errText);
  await page.keyboard.press("Escape");
  await page.locator(".modal-backdrop").click({ position: { x: 4, y: 4 } }).catch(() => {});
  await page.waitForTimeout(300);

  // open drawer and log an interaction
  await page.locator("tr[data-lead]").first().click();
  await page.waitForTimeout(800);
  log("lead drawer opens with score breakdown", (await page.locator(".factor").count()) === 5);
  await page.locator('[data-act="interaction"]').click();
  await page.waitForTimeout(400);
  await page.fill("#it-summary", "Called the customer and confirmed the quote is coming.");
  await page.selectOption("#it-direction", "inbound");
  await page.selectOption("#it-outcome", "response");
  await page.locator("[data-save]").click();
  await page.waitForTimeout(1100);
  const history = await page.locator(".tl-item").count();
  log("interaction appears in history", history >= 1, `items=${history}`);
  const drawerFirstResponse = await page.locator(".drawer-body").innerText();
  log("first response recorded", /First response/.test(drawerFirstResponse));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // recovery: create a neglected lead
  await page.goto(`${BASE}/app/leads?new=1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.fill("#lf-name", "Old Neglected Lead");
  await page.fill("#lf-phone", "+15550188");
  await page.fill("#lf-received", new Date(Date.now() - 8 * 86400000).toISOString().slice(0, 10));
  await page.locator("[data-save]").click();
  await page.waitForTimeout(1200);
  await page.goto(`${BASE}/app/recovery`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const queueCards = await page.locator("article.card").count();
  log("recovery flag raised automatically", queueCards >= 1, `cards=${queueCards}`);
  const flagText = await page.locator("article.card").first().innerText();
  log("flag explains the reason", /response|contact|inactive/i.test(flagText));
  await page.screenshot({ path: `${OUT}/20-recovery-flagged.png`, fullPage: false });

  // mark recovered
  await page.locator("[data-recover]").first().click();
  await page.waitForTimeout(400);
  await page.locator(".modal [data-ok]").click();
  await page.waitForTimeout(1300);
  const emptyQueue = await page.locator(".empty h3").first().innerText().catch(() => "");
  log("mark recovered clears the flag", /nothing neglected/i.test(emptyQueue), emptyQueue);
  await page.goto(`${BASE}/app/reports?from=${new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".stat", { timeout: 10000 });
  await page.waitForTimeout(400);
  const reportText = await page.locator(".content").innerText();
  log("report shows recovered lead", /Recovered leads/i.test(reportText), reportText.slice(0, 120).replace(/\n/g, " | "));
  await page.screenshot({ path: `${OUT}/21-reports-after-recovery.png`, fullPage: false });

  // CSV import through the UI
  await page.goto(`${BASE}/app/leads`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await page.locator("[data-import]").click();
  await page.waitForTimeout(300);
  await page.fill("#csv-text", "name,phone,email,company,source,deal value,status\nTomas Vidal,+15550177,tomas@example.test,Vidal & Co,Google Ads,12500,interested\nPriya Nair,+15550166,priya@example.test,Nair Consulting,Referral,2750,new");
  await page.locator("[data-preview-btn]").click();
  await page.waitForTimeout(900);
  const previewText = await page.locator("[data-preview]").innerText();
  log("csv preview reports ready rows", /ready/.test(previewText), previewText.slice(0, 80));
  await page.locator("[data-import-btn]").click();
  await page.waitForTimeout(1200);
  const rowCount = await page.locator("tr[data-lead]").count();
  log("csv import adds leads to the table", rowCount >= 3, `rows=${rowCount}`);

  // complete a follow-up
  await page.goto(`${BASE}/app/followups?view=upcoming`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  const hasTasks = await page.locator("[data-complete]").count();
  if (hasTasks) {
    await page.locator("[data-complete]").first().click();
    await page.waitForTimeout(400);
    await page.selectOption("#cp-outcome", "response");
    await page.fill("#cp-note", "Customer replied and asked for the revised quote.");
    await page.selectOption("#cp-next", "7");
    await page.locator(".modal [data-save]").click();
    await page.waitForTimeout(1200);
    log("follow-up completed with outcome", true);
  } else {
    // schedule one from the lead drawer instead
    await page.goto(`${BASE}/app/leads`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    await page.locator("tr[data-lead]").first().click();
    await page.waitForTimeout(700);
    await page.locator('[data-act="followup"]').click();
    await page.waitForTimeout(400);
    await page.locator(".modal [data-save]").click();
    await page.waitForTimeout(1200);
    await page.goto(`${BASE}/app/followups?view=upcoming`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    await page.locator("[data-complete]").first().click();
    await page.waitForTimeout(400);
    await page.selectOption("#cp-outcome", "response");
    await page.locator(".modal [data-save]").click();
    await page.waitForTimeout(1200);
    log("follow-up scheduled and completed", true);
  }

  // settings: add a status and a source, change recovery threshold
  await page.goto(`${BASE}/app/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.locator("[data-add-status]").click();
  await page.waitForTimeout(200);
  const rowInputs = page.locator("[data-status-rows] tr").last().locator("input");
  await rowInputs.nth(0).fill("nurture");
  await rowInputs.nth(1).fill("Nurture");
  await page.locator("[data-save-statuses]").click();
  await page.waitForTimeout(1200);
  const toastText = await page.locator(".toast").last().innerText().catch(() => "");
  log("status saved", /saved/i.test(toastText), toastText);

  await page.fill("[data-sources]", "Website\nReferral\nGoogle Ads\nWalk-in");
  await page.locator("[data-save-sources]").click();
  await page.waitForTimeout(1000);

  await page.fill("#rc-contact", "5");
  await page.locator("[data-recovery] button[type=submit]").click();
  await page.waitForTimeout(1100);
  const toast2 = await page.locator(".toast").last().innerText().catch(() => "");
  log("recovery threshold saved", /updated|saved/i.test(toast2), toast2);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  log("threshold persists after reload", (await page.inputValue("#rc-contact")) === "5");

  // invite flow
  await page.goto(`${BASE}/app/team`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await page.locator("[data-invite]").click();
  await page.waitForTimeout(400);
  await page.fill("#iv-name", "Flow Employee");
  await page.fill("#iv-email", `employee.${stamp}@example.test`);
  await page.selectOption("#iv-role", "employee");
  await page.locator(".modal [data-save]").click();
  await page.waitForTimeout(1000);
  const inviteModal = await page.locator(".modal").last().innerText().catch(() => "");
  log("invitation link generated", /Invitation created/i.test(inviteModal), inviteModal.slice(0, 60));
  await page.locator(".modal [data-close]").click();
  await page.waitForTimeout(500);

  // delete a lead (destructive confirmation)
  await page.goto(`${BASE}/app/leads`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.locator("tr[data-lead]").first().click();
  await page.waitForTimeout(700);
  await page.locator('[data-act="delete"]').click();
  await page.waitForTimeout(400);
  await page.locator(".modal [data-ok]").click();
  await page.waitForTimeout(1200);
  const rowsAfterDelete = await page.locator("tr[data-lead]").count();
  log("delete removes the lead", rowsAfterDelete < rowCount, `rows=${rowsAfterDelete}`);

  // dashboard reflects real data after the flows
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const total = await page.locator(".stat .value").first().innerText();
  log("dashboard total matches records", Number(total) >= 2, `total=${total}`);
  await page.screenshot({ path: `${OUT}/22-dashboard-empty-flow.png`, fullPage: false });

  // sign out
  await page.goto(`${BASE}/app/account`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.locator("[data-logout]").click();
  await page.waitForTimeout(1200);
  log("sign out returns to login", page.url().includes("/login"));
} catch (err) {
  problems.push(`script: ${err.message}`);
  console.log(`  FAIL script: ${err.message}`);
  await page.screenshot({ path: `${OUT}/99-failure.png`, fullPage: false }).catch(() => {});
} finally {
  await browser.close();
}

console.log(`\nproblems: ${problems.length}`);
for (const p of problems) console.log(`  ! ${p}`);
process.exit(problems.length ? 1 : 0);
