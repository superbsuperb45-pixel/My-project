/**
 * Demo seed: creates one workspace with a full, realistic dataset so the
 * dashboard, recovery engine and reports can be reviewed immediately.
 *
 * Usage:  node scripts/seed-demo.js [--force]
 * Login:  alex@northwind.example / LeadRescue2026!
 *
 * Every number in the app is derived from these records at request time.
 * Nothing here is a hard-coded dashboard figure.
 */
import { all, db, getSettings, nowIso, one, run, tx } from "../src/db.js";
import { hashPassword } from "../src/auth.js";
import { evaluateRecovery } from "../src/services/engine.js";

const force = process.argv.includes("--force");
const email = "alex@northwind.example";
if (one("SELECT id FROM users WHERE email = ?", email) && !force) {
  console.log("Demo workspace already exists. Re-run with --force to recreate (deletes the demo org only).");
  process.exit(0);
}

let seed = 42;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();
const hoursAgo = (hours) => new Date(Date.now() - hours * 3600000).toISOString();

if (force) {
  const existing = one("SELECT id FROM organizations WHERE name = ?", "Northwind Property Group");
  if (existing) {
    run("DELETE FROM organizations WHERE id = ?", existing.id);
    console.log("Removed previous demo organisation.");
  }
}

const now = nowIso();
const orgId = tx(() => {
  const orgRes = run(
    "INSERT INTO organizations (name, industry, currency, timezone, phone, website, settings, created_at) VALUES (?,?,?,?,?,?,?,?)",
    "Northwind Property Group", "Real estate", "USD", "Europe/London", "+44 20 7946 0102", "https://northwind.example", "{}", daysAgo(180),
  );
  const orgId = Number(orgRes.lastInsertRowid);

  const users = [
    ["Alex Whitfield", email, "admin"],
    ["Maya Okafor", "maya@northwind.example", "manager"],
    ["Luis Herrera", "luis@northwind.example", "employee"],
    ["Sofia Lind", "sofia@northwind.example", "employee"],
  ];
  for (const [name, mail, role] of users) {
    run(
      "INSERT INTO users (org_id, name, email, password_hash, role, created_at) VALUES (?,?,?,?,?,?)",
      orgId, name, mail, hashPassword("LeadRescue2026!"), role, daysAgo(170),
    );
  }
  return orgId;
});

const users = all("SELECT * FROM users WHERE org_id = ?", orgId);
const byRole = (role) => users.find((u) => u.role === role);
const maya = users.find((u) => u.name.startsWith("Maya"));
const luis = users.find((u) => u.name.startsWith("Luis"));
const sofia = users.find((u) => u.name.startsWith("Sofia"));

const people = [
  ["Amelia Grant", "Grant Interiors Ltd", "Website", 4800],
  ["Tomas Vidal", "Vidal & Co", "Google Ads", 12500],
  ["Nadia Rahman", "Rahman Dental", "Facebook Ads", 3200],
  ["Owen Fletcher", "Fletcher Logistics", "Phone call", 9400],
  ["Priya Nair", "Nair Consulting", "Referral", 2750],
  ["Harbour Café", "Harbour Café", "Walk-in", 1900],
  ["Brightline Motors", "Brightline Motors", "Trade show", 15600],
  ["Delta Renovations", "Delta Renovations", "Website", 7200],
  ["Westgate Dental", "Westgate Dental", "Google Ads", 5400],
  ["Ingrid Solberg", "Solberg Studio", "Referral", 3100],
  ["Marcus Bell", "Bell & Sons", "Facebook Ads", 8300],
  ["Yara Haddad", "Haddad Interiors", "WhatsApp", 4600],
  ["Peter Novak", "Novak Joinery", "Phone call", 2900],
  ["Chloe Bennett", "Bennett Lettings", "Website", 18900],
  ["Ravi Shah", "Shah Property", "Google Ads", 22400],
  ["Elena Rossi", "Rossi Kitchens", "Walk-in", 6100],
  ["George Mensah", "Mensah Motors", "Facebook Ads", 11300],
  ["Hannah Price", "Price Physio", "Referral", 3600],
  ["Ibrahim Khan", "Khan Foods", "Trade show", 14700],
  ["Julia Meyer", "Meyer Design", "Website", 5200],
  ["Kofi Asante", "Asante Legal", "Phone call", 6800],
  ["Laura Silva", "Silva Ceramics", "WhatsApp", 2300],
  ["Morton & Vale", "Morton & Vale", "Google Ads", 17200],
  ["Nina Petrova", "Petrova Clinic", "Website", 4300],
  ["Oliver Grant", "Grant Roofing", "Facebook Ads", 7800],
  ["Quinn Harper", "Harper Fitness", "Referral", 2700],
  ["Rosa Delgado", "Delgado Florist", "Walk-in", 1600],
  ["Samuel Adeyemi", "Adeyemi Accounts", "Website", 8900],
  ["Tara Singh", "Singh Interiors", "Google Ads", 6900],
  ["Umberto Conti", "Conti Deli", "Phone call", 3400],
  ["Valerie Fox", "Fox Estates", "Referral", 25800],
  ["Wesley Brook", "Brook Plumbing", "Website", 3900],
  ["Ximena Ortiz", "Ortiz Studio", "Facebook Ads", 4700],
  ["Yusuf Demir", "Demir Motors", "Trade show", 13200],
  ["Zoe Kim", "Kim Advisory", "Google Ads", 8100],
  ["Aaron Clarke", "Clarke Electrical", "Phone call", 2800],
  ["Beatrice Lang", "Lang Boutique", "Website", 5100],
  ["Carlos Mendes", "Mendes Tiling", "WhatsApp", 3300],
  ["Diana Novak", "Novak Legal", "Referral", 9700],
  ["Ethan Brooks", "Brooks Motors", "Facebook Ads", 10400],
  ["Farah Ali", "Ali Catering", "Walk-in", 2100],
  ["Gabriel Santos", "Santos Gym", "Website", 7300],
  ["Helen Wu", "Wu Clinic", "Google Ads", 6200],
  ["Isaac Newton", "Newton Joinery", "Phone call", 4500],
  ["Jasmine Cole", "Cole Lettings", "Referral", 16400],
  ["Karim Haddad", "Haddad Motors", "Trade show", 12800],
  ["Lena Fischer", "Fischer Studio", "Website", 3800],
  ["Michael Osei", "Osei Removals", "Facebook Ads", 5600],
];

const sources = ["Website", "Google Ads", "Facebook Ads", "Referral", "Phone call", "Walk-in", "Trade show", "WhatsApp"];
const statusPlan = [
  ...Array(11).fill("converted"),
  ...Array(4).fill("recovered"),
  ...Array(7).fill("new"),
  ...Array(8).fill("contacted"),
  ...Array(6).fill("interested"),
  ...Array(5).fill("follow_up"),
  ...Array(3).fill("overdue"),
  ...Array(4).fill("lost"),
];

const lostReasons = ["Went silent", "Chose a competitor", "Price too high", "No budget", "Not ready to buy", "Duplicate or spam"];

tx(() => {
  people.forEach(([name, company, source, value], index) => {
    const status = statusPlan[index % statusPlan.length];
    const ageDays = 3 + Math.floor(rand() * 115);
    const received = daysAgo(ageDays);
    const contacted = rand() > 0.18;
    const lastContactDays = contacted ? Math.max(0.05, ageDays - rand() * Math.min(ageDays, 20)) : null;
    const lastContact = lastContactDays != null ? hoursAgo(lastContactDays * 24) : null;
    const assignee = pick([maya, luis, sofia, maya, luis]).id;
    const followDays = rand();
    let followUp = null;
    if (!["converted", "lost"].includes(status)) {
      if (followDays < 0.28) followUp = daysAgo(1 + rand() * 5);          // overdue
      else if (followDays < 0.5) followUp = new Date(Date.now() + rand() * 86400000).toISOString(); // today
      else followUp = new Date(Date.now() + (1 + rand() * 12) * 86400000).toISOString();
    }
    const firstResponse = contacted ? new Date(new Date(received).getTime() + (1 + rand() * 9) * 3600000).toISOString() : null;
    const convertedAt = status === "converted" ? daysAgo(Math.max(0.5, ageDays * 0.55)) : null;
    const lostAt = status === "lost" ? daysAgo(Math.max(0.5, ageDays * 0.6)) : null;
    const recoveredAt = status === "recovered" ? daysAgo(Math.max(0.5, ageDays * 0.4)) : null;

    const res = run(
      `INSERT INTO leads (org_id, name, phone, email, company, source, status, deal_value, assigned_to,
          received_at, last_contact_at, first_response_at, follow_up_at, notes, lost_reason, consent,
          recovered_at, recovered_value, converted_at, lost_at, created_at, updated_at, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      orgId, name,
      `+44 20 7${String(1000000 + Math.floor(rand() * 8999999)).slice(0, 7)}`,
      `${name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "")}@example.com`,
      company, source, status, value, assignee,
      received, lastContact, firstResponse, followUp,
      index % 7 === 0 ? "Asked for a written quote and availability for a viewing." : "",
      status === "lost" ? pick(lostReasons) : "",
      index % 11 === 0 ? "granted" : index % 17 === 0 ? "revoked" : "unknown",
      recoveredAt, status === "recovered" ? value : null,
      convertedAt, lostAt, received, lastContact || received, byRole("admin").id,
    );
    const leadId = Number(res.lastInsertRowid);

    if (contacted) {
      const touches = 1 + Math.floor(rand() * 4);
      for (let t = 0; t < touches; t++) {
        const when = hoursAgo(Math.max(1, lastContactDays * 24 + t * 30));
        const type = pick(["call", "email", "whatsapp", "meeting", "note"]);
        const outcome = t === 0 ? pick(["response", "new_opportunity", "no_response", "none"]) : pick(["response", "none"]);
        run(
          `INSERT INTO interactions (org_id, lead_id, user_id, type, channel, direction, summary, outcome, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          orgId, leadId, assignee, type, type, pick(["outbound", "outbound", "inbound"]),
          type === "call" ? "Called to discuss requirements and next steps."
            : type === "email" ? "Emailed the quote and availability."
            : type === "whatsapp" ? "Sent a WhatsApp with viewing options."
            : type === "meeting" ? "Met at the property to walk through requirements."
            : "Added internal note after reviewing the enquiry.",
          outcome, when,
        );
      }
    }

    const followupCount = status === "converted" || status === "lost" ? 1 : 1 + Math.floor(rand() * 2);
    for (let f = 0; f < followupCount; f++) {
      const done = status === "converted" || (rand() > 0.5 && f === 0);
      const due = done ? hoursAgo(24 + rand() * 240) : (followUp || new Date(Date.now() + 3 * 86400000).toISOString());
      const completedAt = done ? new Date(new Date(due).getTime() - Math.floor(rand() * 5) * 3600000 * (rand() > 0.2 ? 1 : -1)).toISOString() : null;
      run(
        `INSERT INTO followups (org_id, lead_id, assigned_to, due_at, channel, note, status, outcome, completed_at, created_by, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        orgId, leadId, assignee, due, pick(["call", "email", "whatsapp"]),
        pick(["Confirm the quote was received.", "Ask about the viewing slot.", "Check if they still need the service.", "Send the revised price."]),
        done ? "completed" : "pending",
        done ? pick(["response", "new_opportunity", "no_response", "conversion"]) : "none",
        completedAt,
        byRole("admin").id, due,
      );
    }
  });
});

// A couple of sales that came out of recovery, so "recovered -> converted" is demonstrated.
tx(() => {
  const converted = all("SELECT * FROM leads WHERE org_id = ? AND status = 'converted' ORDER BY deal_value DESC LIMIT 2", orgId);
  converted.forEach((lead) => {
    const recovered = new Date(new Date(lead.converted_at).getTime() - 6 * 86400000).toISOString();
    run("UPDATE leads SET recovered_at = ?, recovered_value = ? WHERE id = ?", recovered, lead.deal_value, lead.id);
    run(
      `INSERT OR IGNORE INTO recovery_events (org_id, lead_id, rule_key, rule_label, recommendation, severity, status, detected_at, resolved_at, resolution, resolved_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      orgId, lead.id, "stalled_interest", "Showed interest but never purchased",
      "Marked interested without a decision. Offer a concrete next step: a quote, a viewing slot or a call at a specific time.",
      2, "resolved", new Date(new Date(recovered).getTime() - 11 * 86400000).toISOString(), recovered, "recovered", lead.assigned_to,
    );
  });

  const templates = [
    ["Re-engagement (email)", "email", "Still interested in {company}?", "Hi {first_name},\n\nYou asked us about {company} a while ago and I never got back to you with a proper answer — apologies for that.\n\nAre you still looking? If so, I can put together a short quote today.\n\nBest,\n{employee}\n{business}"],
    ["Quote follow-up (email)", "email", "Your quote from {business}", "Hi {first_name},\n\nJust checking whether the quote came through. Happy to adjust scope or timing — let me know what would make it work.\n\n{employee}"],
    ["Quick check-in (WhatsApp)", "whatsapp", "", "Hi {first_name}, it's {employee} from {business}. Following up on your enquiry — still interested? Happy to send details over."],
    ["Appointment reminder (SMS)", "sms", "", "Hi {first_name}, reminder of your appointment with {business}. Reply YES to confirm or call us to move it."],
  ];
  for (const [name, channel, subject, body] of templates) {
    run("INSERT INTO templates (org_id, name, channel, subject, body, created_at) VALUES (?,?,?,?,?,?)",
      orgId, name, channel, subject, body, daysAgo(60));
  }

  const recent = all("SELECT * FROM leads WHERE org_id = ? AND status IN ('contacted','interested','follow_up') LIMIT 6", orgId);
  recent.forEach((lead, index) => {
    const when = hoursAgo(4 + index * 11);
    const channel = ["email", "whatsapp", "sms", "email", "email", "whatsapp"][index % 6];
    run(
      `INSERT INTO messages (org_id, lead_id, user_id, channel, direction, to_address, subject, body, status, provider, created_at, sent_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      orgId, lead.id, lead.assigned_to, channel, "outbound",
      channel === "email" ? lead.email : lead.phone,
      channel === "email" ? "Following up on your enquiry" : "",
      `Hi ${String(lead.name).split(" ")[0]}, following up on your enquiry with a couple of next steps. Let me know what suits.`,
      "logged", "", when, null,
    );
  });
});

// Historical recovery events so the recovery chart has real history, not a
// single spike on the day the demo was seeded.
tx(() => {
  const leads = all("SELECT * FROM leads WHERE org_id = ?", orgId);
  for (const lead of leads) {
    if (lead.recovered_at) {
      const detected = new Date(new Date(lead.recovered_at).getTime() - (9 + Math.floor(rand() * 18)) * 86400000).toISOString();
      run(
        `INSERT OR IGNORE INTO recovery_events (org_id, lead_id, rule_key, rule_label, recommendation, severity, status, detected_at, resolved_at, resolution, resolved_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        orgId, lead.id, "no_contact", "No contact for several days",
        "No logged contact for several days. Send a short re-engagement message referencing their original inquiry.",
        2, "resolved", detected, lead.recovered_at, "recovered", lead.assigned_to,
      );
    } else if (lead.status === "lost") {
      const detected = new Date(new Date(lead.lost_at).getTime() - (7 + Math.floor(rand() * 14)) * 86400000).toISOString();
      run(
        `INSERT OR IGNORE INTO recovery_events (org_id, lead_id, rule_key, rule_label, recommendation, severity, status, detected_at, resolved_at, resolution, resolved_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        orgId, lead.id, "no_contact", "No contact for several days",
        "No logged contact for several days. Send a short re-engagement message referencing their original inquiry.",
        2, "resolved", detected, lead.lost_at, "marked_lost", lead.assigned_to,
      );
    } else if (lead.status === "converted") {
      const detected = new Date(new Date(lead.converted_at).getTime() - (12 + Math.floor(rand() * 20)) * 86400000).toISOString();
      run(
        `INSERT OR IGNORE INTO recovery_events (org_id, lead_id, rule_key, rule_label, recommendation, severity, status, detected_at, resolved_at, resolution, resolved_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        orgId, lead.id, "stalled_interest", "Showed interest but never purchased",
        "Marked interested without a decision. Offer a concrete next step: a quote, a viewing slot or a call at a specific time.",
        2, "resolved", detected, lead.converted_at, "converted", lead.assigned_to,
      );
    }
  }
});

const org = one("SELECT * FROM organizations WHERE id = ?", orgId);
const result = evaluateRecovery(org, getSettings(org), {});
console.log(`Demo workspace ready: Northwind Property Group (org ${orgId})`);
console.log(`Leads: ${all("SELECT id FROM leads WHERE org_id = ?", orgId).length}`);
console.log(`Recovery flags created: ${result.created}`);
console.log(`Sign in: ${email} / LeadRescue2026!`);
