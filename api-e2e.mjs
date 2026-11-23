/**
 * End-to-end API test against a running LeadRescue server.
 * Usage: node test/api-e2e.mjs http://localhost:3111
 */
const BASE = process.argv[2] || "http://localhost:3111";
let cookie = "";
let pass = 0;
let fail = 0;

async function req(path, { method = "GET", body, raw = false } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const set = res.headers.getSetCookie?.() || [];
  for (const c of set) {
    const [pair] = c.split(";");
    if (pair.startsWith("lr_session=")) cookie = pair;
  }
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text, headers: res.headers, raw };
}

const okStatus = (r) => r.status >= 200 && r.status < 300;

function check(name, cond, extra = "") {
  if (cond) { pass += 1; console.log(`  ok   ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name} ${extra}`); }
}

const rand = Math.random().toString(36).slice(2, 8);
const email = `owner.${rand}@example.test`;
const password = "TestingPass123";

console.log(`\nLeadRescue API tests against ${BASE}\n`);

// 1. public pages + SEO
for (const path of ["/", "/lead-follow-up-software", "/robots.txt", "/sitemap.xml", "/signup"]) {
  const r = await req(path);
  check(`GET ${path} → 200`, r.status === 200, `got ${r.status}`);
}
const home = await req("/");
check("homepage contains headline", home.text.includes("Stop Losing Customers You Already Paid to Acquire."));
check("homepage has canonical", home.text.includes('<link rel="canonical" href="'));
check("homepage has JSON-LD FAQPage", home.text.includes('"FAQPage"'));
check("homepage not noindex", !home.text.includes("noindex"));
const robots = await req("/robots.txt");
check("robots.txt allows crawling", !/Disallow:\s*\/\s*$/m.test(robots.text) && robots.text.includes("Sitemap:"));
const sitemap = await req("/sitemap.xml");
check("sitemap lists homepage", sitemap.text.includes("<loc>") && sitemap.text.includes("/lead-follow-up-software"));
const gfile = await req("/google1234567890abcdef.html");
check("google verification file served", gfile.status === 200 && gfile.text.includes("google-site-verification: google1234567890abcdef.html"));

// 2. signup + session
const signup = await req("/api/auth/signup", { method: "POST", body: { org_name: `Test Co ${rand}`, name: "Test Owner", email, password, currency: "USD", timezone: "UTC", industry: "Consulting" } });
check("signup creates workspace", signup.status === 201, JSON.stringify(signup.json));
check("signup returns admin role", signup.json?.user?.role === "admin");
const me = await req("/api/auth/me");
check("session cookie works", me.status === 200 && me.json.user.email === email);
check("capabilities include lead:delete", me.json.capabilities.includes("lead:delete"));

// 3. leads CRUD
const created = await req("/api/leads", { method: "POST", body: { name: "Nadia Rahman", phone: "+15550142", email: "nadia@example.test", company: "Rahman Dental", source: "Website", deal_value: 4200, status: "new", follow_up_at: new Date(Date.now() + 86400000).toISOString() } });
check("create lead", created.status === 201 && created.json.lead.id, JSON.stringify(created.json));
const leadId = created.json?.lead?.id;
check("lead sanitised and stored", created.json?.lead?.deal_value === 4200);
const badLead = await req("/api/leads", { method: "POST", body: { name: "", phone: "" } });
check("server rejects empty lead", badLead.status === 400);
const noContact = await req("/api/leads", { method: "POST", body: { name: "No Contact" } });
check("server requires phone or email", noContact.status === 400);
const updated = await req(`/api/leads/${leadId}`, { method: "PATCH", body: { status: "contacted", notes: "Called once" } });
check("update lead", updated.status === 200 && updated.json.lead.status === "contacted");
const list = await req("/api/leads?q=rahman");
check("search finds lead", list.status === 200 && list.json.total === 1);
check("priority score attached with factors", list.json.leads[0].score.factors.length === 5);
const detail = await req(`/api/leads/${leadId}`);
check("lead detail returns relations", detail.status === 200 && Array.isArray(detail.json.interactions));
const interaction = await req(`/api/leads/${leadId}/interactions`, { method: "POST", body: { type: "call", direction: "inbound", outcome: "response", summary: "Customer called back, wants a quote." } });
check("log interaction", interaction.status === 201 && interaction.json.lead.first_response_at);
const fu = await req(`/api/leads/${leadId}/followups`, { method: "POST", body: { due_at: new Date(Date.now() + 2 * 86400000).toISOString(), channel: "call", note: "Send quote" } });
check("schedule follow-up", fu.status === 201);
const followupId = fu.json?.followup?.id;

// 4. recovery engine
const recovery = await req("/api/recovery");
check("recovery queue loads", recovery.status === 200 && Array.isArray(recovery.json.queue));
const run = await req("/api/recovery/run", { method: "POST" });
check("engine run returns counts", okStatus(run) && typeof run.json.created === "number", JSON.stringify(run.json));

// make an old, unanswered lead to trigger rules
const oldLead = await req("/api/leads", { method: "POST", body: { name: "Old Inquiry", phone: "+15550199", received_at: new Date(Date.now() - 6 * 86400000).toISOString(), status: "new" } });
await req("/api/recovery/run", { method: "POST" });
const rec2 = await req("/api/recovery");
const oldEntry = rec2.json.queue.find((q) => q.lead_id === oldLead.json.lead.id);
check("neglected lead flagged", Boolean(oldEntry), JSON.stringify(rec2.json.counts));
check("flag has recommendation", oldEntry?.flags[0]?.recommendation?.length > 20);
const recover = await req(`/api/leads/${oldLead.json.lead.id}/recover`, { method: "POST", body: { recovered_value: 1500 } });
check("mark recovered", okStatus(recover) && recover.json?.lead?.status === "recovered", JSON.stringify(recover.json));
const convert = await req(`/api/leads/${oldLead.json.lead.id}/convert`, { method: "POST", body: { deal_value: 1500 } });
check("convert recovered lead", okStatus(convert) && convert.json?.lead?.status === "converted", JSON.stringify(convert.json));

// 5. follow-ups
const fuList = await req("/api/followups?view=today");
const fuAll = await req("/api/followups");
check("follow-up list loads", fuAll.status === 200 && Array.isArray(fuAll.json.followups));
const complete = await req(`/api/followups/${followupId}/complete`, { method: "POST", body: { outcome: "response", note: "Spoke to customer", next_followup_days: 3 } });
check("complete follow-up records outcome", okStatus(complete) && complete.json?.followup?.status === "completed" && complete.json?.followup?.outcome === "response", JSON.stringify(complete.json));

// 6. communications: unconfigured provider must refuse honestly
const send = await req("/api/comms/send", { method: "POST", body: { lead_id: leadId, channel: "email", body: "Hello {first_name}" } });
check("unconfigured email refused with 409", send.status === 409 && send.json.error.code === "PROVIDER_NOT_CONFIGURED", JSON.stringify(send.json));
const logged = await req("/api/comms/send", { method: "POST", body: { lead_id: leadId, channel: "email", body: "Manual call summary", log_only: true } });
check("manual contact logging works", logged.status === 201 && logged.json.logged === true);
const tpl = await req("/api/comms/templates", { method: "POST", body: { name: "Follow-up", channel: "email", subject: "Checking in", body: "Hi {first_name}" } });
check("create template", tpl.status === 201);
const optOut = await req(`/api/leads/${leadId}/consent`, { method: "PATCH", body: { consent: "revoked" } });
check("set consent revoked", optOut.status === 200 && optOut.json.lead.opted_out === true);
const blocked = await req("/api/comms/send", { method: "POST", body: { lead_id: leadId, channel: "email", body: "Should be blocked" } });
check("opted-out lead blocked", blocked.status === 409 && blocked.json.error.code === "CONSENT_BLOCKED");

// 7. csv import/export
const csv = "name,phone,email,company,source,deal value,status,follow up\nAmelia Grant,+15550188,amelia@example.test,Grant Interiors,Referral,5200,interested,2026-06-01\nBad Row,,,No Contact,,10,new,";
const preview = await req("/api/leads/import", { method: "POST", body: { csv, dry_run: true } });
check("csv preview validates rows", okStatus(preview) && preview.json.valid === 1 && preview.json.error_count === 1, JSON.stringify(preview.json));
const imported = await req("/api/leads/import", { method: "POST", body: { csv } });
check("csv import inserts rows", imported.status === 201 && imported.json.imported === 1);
const dupImport = await req("/api/leads/import", { method: "POST", body: { csv, skip_duplicates: true } });
check("csv dupe skip works", dupImport.status === 201 && dupImport.json.imported === 0);
const exportCsv = await req("/api/leads/export.csv");
check("csv export returns rows", exportCsv.status === 200 && exportCsv.text.startsWith("id,name,phone"));

// 8. dashboard + reports
const dash = await req("/api/dashboard?days=90");
check("dashboard metrics numeric", dash.status === 200 && typeof dash.json.metrics.total_leads === "number");
const report = await req("/api/reports?from=2020-01-01&to=2030-01-01");
check("reports include employees", report.status === 200 && report.json.employees.length >= 1);
const reportCsv = await req("/api/reports/export.csv?type=sources&from=2020-01-01&to=2030-01-01");
check("report csv export", reportCsv.status === 200 && reportCsv.text.includes("source,leads"));
const dashFromData = dash.json.metrics.total_leads >= 3;
check("dashboard counts real records", dashFromData, JSON.stringify(dash.json.metrics));

// 9. settings
const settings = await req("/api/settings");
check("settings load", settings.status === 200 && Array.isArray(settings.json.settings.statuses));
const newStatuses = settings.json.settings.statuses.map((s) => ({ ...s }));
newStatuses.push({ key: "nurture", label: "Nurture", kind: "open", color: "#0ea5e9" });
const patched = await req("/api/settings", { method: "PATCH", body: { statuses: newStatuses, recovery: { no_contact_days: 9, auto_overdue: false, overdue_status_key: "overdue" } } });
check("settings patch accepts valid statuses", patched.status === 200 && patched.json.settings.recovery.no_contact_days === 9);
const badStatuses = await req("/api/settings", { method: "PATCH", body: { statuses: [{ key: "x", label: "X", kind: "open", color: "#fff" }] } });
check("settings rejects invalid status config", badStatuses.status === 400);

// 10. team + isolation
const invite = await req("/api/team/invite", { method: "POST", body: { name: "Sam Employee", email: `sam.${rand}@example.test`, role: "employee" } });
check("invite creates link", invite.status === 201 && invite.json.invite.invite_url.includes("/invite/"));
const token = invite.json.invite.token;
const peek = await req(`/api/auth/invite/${token}`);
check("invite peek works", peek.status === 200 && peek.json.invite.role === "employee");
const adminCookie = cookie;
cookie = "";
const accept = await req(`/api/auth/invite/${token}/accept`, { method: "POST", body: { name: "Sam Employee", password: "EmployeePass123" } });
check("invite accept creates session", accept.status === 201 && accept.json.user.role === "employee");
const empLeads = await req("/api/leads");
check("employee sees only own leads", empLeads.status === 200 && empLeads.json.total === 0, `total=${empLeads.json.total}`);
const empSettings = await req("/api/settings");
check("employee blocked from settings", empSettings.status === 403);
const empDelete = await req(`/api/leads/${leadId}`, { method: "DELETE" });
check("employee cannot delete lead", empDelete.status === 403 || empDelete.status === 404);
const empDashboard = await req("/api/dashboard");
check("employee dashboard scoped", empDashboard.status === 200 && empDashboard.json.metrics.total_leads === 0);
cookie = adminCookie;

// cross-organisation isolation
cookie = "";
const otherEmail = `other.${rand}@example.test`;
await req("/api/auth/signup", { method: "POST", body: { org_name: `Other Co ${rand}`, name: "Other Owner", email: otherEmail, password, currency: "USD", timezone: "UTC" } });
const stolen = await req(`/api/leads/${leadId}`);
check("cross-org lead access denied", stolen.status === 404 || stolen.status === 403, `got ${stolen.status}`);
const otherList = await req("/api/leads");
check("other org sees no foreign leads", otherList.json.total === 0);
cookie = adminCookie;

// 11. delete lead (destructive path)
const del = await req(`/api/leads/${leadId}`, { method: "DELETE" });
check("delete lead", del.status === 200);
const gone = await req(`/api/leads/${leadId}`);
check("deleted lead 404", gone.status === 404);

// 12. auth protections
const badLogin = await req("/api/auth/login", { method: "POST", body: { email, password: "wrong-password" } });
check("bad password rejected", badLogin.status === 401);
const anon = await fetch(`${BASE}/api/leads`);
check("anonymous API blocked", anon.status === 401);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
