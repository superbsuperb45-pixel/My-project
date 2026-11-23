import { api, esc, icons, toast, state, refreshSession, can, dateShort } from "./view-helpers.js";

const KINDS = [
  ["open", "Open — still in pipeline"],
  ["recovered", "Recovered — came back after neglect"],
  ["won", "Converted / won"],
  ["lost", "Lost / closed"],
];

export async function render(root, ctx) {
  const data = await api("/api/settings");
  const s = data.settings;
  const org = data.organization;
  const providers = data.providers;
  let statuses = s.statuses.map((x) => ({ ...x }));
  let sources = [...s.sources];

  root.innerHTML = `
    <div class="page-head">
      <div class="titles">
        <h1>Settings</h1>
        <p>Business details, lead statuses, recovery thresholds, prioritisation weights and integrations. Changes are validated on the server.</p>
      </div>
    </div>

    <div class="stack" style="gap:14px">
      <section class="card" id="business">
        <div class="card-head"><h2>Business information</h2><span class="spacer"></span><span class="small muted">Used across the workspace</span></div>
        <div class="card-pad">
          <form data-business class="form-grid">
            <div class="field"><label for="st-name">Business name</label><input id="st-name" name="name" value="${esc(org.name)}" required maxlength="120" /></div>
            <div class="field"><label for="st-industry">Industry</label><input id="st-industry" name="industry" value="${esc(org.industry)}" maxlength="80" /></div>
            <div class="field"><label for="st-currency">Currency</label><select id="st-currency" name="currency">
              ${data.currencies.map((c) => `<option ${c === org.currency ? "selected" : ""}>${c}</option>`).join("")}
            </select></div>
            <div class="field"><label for="st-timezone">Time zone</label><input id="st-timezone" name="timezone" value="${esc(org.timezone)}" maxlength="64" list="tz-list" />
              <datalist id="tz-list">${(data.timezones || []).slice(0, 400).map((tz) => `<option value="${esc(tz)}"></option>`).join("")}</datalist></div>
            <div class="field"><label for="st-phone">Business phone</label><input id="st-phone" name="phone" value="${esc(org.phone)}" maxlength="40" /></div>
            <div class="field"><label for="st-website">Website</label><input id="st-website" name="website" value="${esc(org.website)}" maxlength="200" /></div>
            <div class="full stack-row"><button class="btn btn-primary btn-sm" type="submit">Save business details</button><span class="tiny muted">Workspace created ${dateShort(org.created_at)}</span></div>
          </form>
        </div>
      </section>

      <section class="card" id="statuses">
        <div class="card-head"><h2>Lead statuses and sources</h2><span class="spacer"></span><span class="small muted">Statuses in use cannot be removed</span></div>
        <div class="card-pad">
          <div class="table-wrap" style="margin-bottom:10px">
            <table class="data">
              <thead><tr><th scope="col">Key</th><th scope="col">Label</th><th scope="col">Behaviour</th><th scope="col">Colour</th><th scope="col"></th></tr></thead>
              <tbody data-status-rows></tbody>
            </table>
          </div>
          <div class="stack-row">
            <button class="btn btn-ghost btn-sm" type="button" data-add-status>${icons.plus} Add status</button>
            <button class="btn btn-primary btn-sm" type="button" data-save-statuses>Save statuses</button>
            <span class="tiny muted">At least one "converted" and one "lost" status is required.</span>
          </div>
          <div class="divider"></div>
          <div class="field">
            <label for="st-sources">Lead sources (one per line)</label>
            <textarea id="st-sources" rows="5" data-sources>${esc(sources.join("\n"))}</textarea>
            <span class="help">These appear in the lead form and the source performance report.</span>
          </div>
          <button class="btn btn-primary btn-sm" type="button" data-save-sources style="margin-top:8px">Save sources</button>
        </div>
      </section>

      <section class="card" id="recovery">
        <div class="card-head"><h2>Recovery rules</h2><span class="spacer"></span><span class="small muted">The core of LeadRescue</span></div>
        <div class="card-pad">
          <form data-recovery>
            <div class="form-grid">
              <div class="field"><label for="rc-response">Hours allowed before a first response</label><input id="rc-response" name="no_response_hours" type="number" min="1" max="720" value="${s.recovery.no_response_hours}" />
                <span class="help">New inquiries with no logged response after this window become critical flags.</span></div>
              <div class="field"><label for="rc-contact">Days allowed without contact</label><input id="rc-contact" name="no_contact_days" type="number" min="1" max="365" value="${s.recovery.no_contact_days}" /></div>
              <div class="field"><label for="rc-interest">Days an interested lead may stall</label><input id="rc-interest" name="stalled_interest_days" type="number" min="1" max="365" value="${s.recovery.stalled_interest_days}" /></div>
              <div class="field"><label for="rc-inactive">Days before a lead is inactive</label><input id="rc-inactive" name="inactive_days" type="number" min="1" max="365" value="${s.recovery.inactive_days}" /></div>
              <div class="field"><label for="rc-overdue">Automatic overdue status</label><select id="rc-overdue" name="overdue_status_key">
                ${s.statuses.map((x) => `<option value="${esc(x.key)}" ${x.key === s.recovery.overdue_status_key ? "selected" : ""}>${esc(x.label)}</option>`).join("")}
              </select></div>
              <div class="field"><label>Apply it automatically</label>
                <label class="checkbox" style="margin-top:8px"><input type="checkbox" name="auto_overdue" ${s.recovery.auto_overdue ? "checked" : ""} /> Move leads with overdue follow-ups into this status</label>
              </div>
            </div>
            <p class="tiny muted" style="margin-top:8px">Recovery flags are always created regardless of the automatic status. Flags resolve automatically when the condition no longer applies, and stay in the history.</p>
            <button class="btn btn-primary btn-sm" type="submit" style="margin-top:8px">Save recovery rules</button>
          </form>
        </div>
      </section>

      <section class="card" id="scoring">
        <div class="card-head"><h2>Priority scoring</h2><span class="spacer"></span><span class="small muted">Points, not probabilities</span></div>
        <div class="card-pad">
          <form data-scoring>
            <p class="small muted" style="margin-bottom:10px">Weights determine how the priority score orders the queue. The breakdown is always shown on each lead so the ranking is explainable.</p>
            <div class="form-grid">
              ${[["recency", "Time since last contact"], ["interest", "Customer interest"], ["value", "Potential deal value"], ["engagement", "Interaction history"], ["urgency", "Follow-up urgency"]].map(([key, label]) => `
                <div class="field"><label for="sc-${key}">${esc(label)}</label><input id="sc-${key}" name="${key}" type="number" min="0" max="100" value="${s.scoring.weights[key]}" data-weight /></div>`).join("")}
            </div>
            <div class="stack-row" style="margin-top:10px"><button class="btn btn-primary btn-sm" type="submit">Save weights</button><span class="small muted">Total: <strong data-weight-total></strong> points</span></div>
          </form>
        </div>
      </section>

      <section class="card" id="notifications">
        <div class="card-head"><h2>Follow-up and notifications</h2></div>
        <div class="card-pad">
          <form data-followup>
            <div class="form-grid">
              <div class="field"><label for="fu-default">Default follow-up interval (days)</label><input id="fu-default" name="default_interval_days" type="number" min="1" max="90" value="${s.followup.default_interval_days}" /></div>
              <div class="field"><label for="fu-reminder">Reminder lead time (hours)</label><input id="fu-reminder" name="reminder_lead_hours" type="number" min="0" max="168" value="${s.followup.reminder_lead_hours}" /></div>
            </div>
            <div class="stack" style="gap:8px;margin-top:12px">
              <label class="checkbox"><input type="checkbox" name="overdue_alerts" ${s.notifications.overdue_alerts ? "checked" : ""} /> Show overdue follow-up alerts in the notification panel</label>
              <label class="checkbox"><input type="checkbox" name="in_app" ${s.notifications.in_app ? "checked" : ""} /> Enable in-app notifications</label>
              <label class="checkbox"><input type="checkbox" name="daily_digest" ${s.followup.daily_digest ? "checked" : ""} /> Prepare a daily digest of follow-ups due (requires email provider)</label>
              <label class="checkbox"><input type="checkbox" name="email_digest" ${s.notifications.email_digest ? "checked" : ""} /> Send the digest by email (requires email provider configured on the server)</label>
            </div>
            <p class="tiny muted" style="margin-top:8px">Notification preferences are stored with your workspace. Email delivery only works once the server has provider credentials — the in-app panel always works.</p>
            <button class="btn btn-primary btn-sm" type="submit" style="margin-top:8px">Save preferences</button>
          </form>
        </div>
      </section>

      <section class="card" id="integrations">
        <div class="card-head"><h2>Integrations</h2><span class="spacer"></span><span class="small muted">Credentials live in server environment variables</span></div>
        <div class="card-pad">
          <div class="grid-3" style="margin-bottom:12px">
            ${[["email", "Email", "RESEND_API_KEY, RESEND_FROM"], ["whatsapp", "WhatsApp", "WHATSAPP_TOKEN, WHATSAPP_PHONE_ID"], ["sms", "SMS", "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM"]].map(([key, label, vars]) => `
              <div class="note-item">
                <div class="stack-row" style="justify-content:space-between"><strong>${esc(label)}</strong><span class="badge ${providers[key] ? "converted" : "outline"}">${providers[key] ? "Configured" : "Not configured"}</span></div>
                <div class="tiny muted" style="margin-top:6px">${esc(providers.detail[key])}</div>
                <div class="mono tiny" style="margin-top:6px">${esc(vars)}</div>
              </div>`).join("")}
          </div>
          <p class="small muted" style="margin:0">To activate a channel, set the listed environment variables on the server and restart. LeadRescue never reports a message as sent unless the provider accepted it; unconfigured attempts are stored as failed drafts in the communication history.</p>
        </div>
      </section>
    </div>`;

  // ---- statuses editor ---------------------------------------------------
  const rows = root.querySelector("[data-status-rows]");
  const lockedKeys = new Set(s.statuses.map((x) => x.key));

  function renderStatuses() {
    rows.innerHTML = statuses.map((st, index) => `
      <tr data-row="${index}">
        <td><input value="${esc(st.key)}" data-field="key" ${lockedKeys.has(st.key) ? "readonly" : ""} maxlength="40" style="min-width:110px" aria-label="Status key" /></td>
        <td><input value="${esc(st.label)}" data-field="label" maxlength="60" aria-label="Status label" /></td>
        <td><select data-field="kind" aria-label="Status behaviour">${KINDS.map(([k, l]) => `<option value="${k}" ${st.kind === k ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></td>
        <td><input type="color" value="${esc(st.color || "#64748b")}" data-field="color" style="width:44px;height:30px;padding:2px" aria-label="Status colour" /></td>
        <td class="right"><button class="btn btn-ghost btn-sm" type="button" data-remove="${index}" ${lockedKeys.has(st.key) ? "disabled" : ""}>Remove</button></td>
      </tr>`).join("");
    rows.querySelectorAll("[data-field]").forEach((input) => input.addEventListener("change", () => {
      const index = Number(input.closest("[data-row]").getAttribute("data-row"));
      statuses[index][input.getAttribute("data-field")] = input.value;
    }));
    rows.querySelectorAll("[data-remove]").forEach((btn) => btn.addEventListener("click", () => {
      statuses.splice(Number(btn.getAttribute("data-remove")), 1);
      renderStatuses();
    }));
  }
  renderStatuses();

  root.querySelector("[data-add-status]").addEventListener("click", () => {
    statuses.push({ key: `custom_${statuses.length + 1}`, label: "New status", kind: "open", color: "#64748b" });
    renderStatuses();
  });

  root.querySelector("[data-save-statuses]").addEventListener("click", async () => {
    try {
      const res = await api("/api/settings", { method: "PATCH", body: { statuses } });
      statuses = res.settings.statuses.map((x) => ({ ...x }));
      lockedKeys.clear();
      res.settings.statuses.forEach((x) => lockedKeys.add(x.key));
      renderStatuses();
      await refreshSession();
      toast("Lead statuses saved.", "success");
    } catch (err) {
      toast(err.message, "error");
    }
  });

  root.querySelector("[data-save-sources]").addEventListener("click", async () => {
    const list = root.querySelector("[data-sources]").value.split("\n").map((x) => x.trim()).filter(Boolean);
    try {
      const res = await api("/api/settings", { method: "PATCH", body: { sources: list } });
      sources = res.settings.sources;
      root.querySelector("[data-sources]").value = sources.join("\n");
      await refreshSession();
      toast("Lead sources saved.", "success");
    } catch (err) {
      toast(err.message, "error");
    }
  });

  // ---- business ----------------------------------------------------------
  root.querySelector("[data-business]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = Object.fromEntries(new FormData(event.target).entries());
    try {
      await api("/api/settings", { method: "PATCH", body: { business: fd } });
      await refreshSession();
      toast("Business details saved.", "success");
    } catch (err) {
      toast(err.message, "error");
    }
  });

  // ---- recovery rules ----------------------------------------------------
  root.querySelector("[data-recovery]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const body = {
      recovery: {
        no_response_hours: form.no_response_hours.value,
        no_contact_days: form.no_contact_days.value,
        stalled_interest_days: form.stalled_interest_days.value,
        inactive_days: form.inactive_days.value,
        overdue_status_key: form.overdue_status_key.value,
        auto_overdue: form.auto_overdue.checked,
      },
    };
    try {
      await api("/api/settings", { method: "PATCH", body });
      await refreshSession();
      toast("Recovery rules updated. The engine will apply them immediately.", "success");
    } catch (err) {
      toast(err.message, "error");
    }
  });

  // ---- scoring -----------------------------------------------------------
  const weights = Array.from(root.querySelectorAll("[data-weight]"));
  const totalEl = root.querySelector("[data-weight-total]");
  const updateTotal = () => { totalEl.textContent = weights.reduce((sum, i) => sum + (Number(i.value) || 0), 0); };
  weights.forEach((input) => input.addEventListener("input", updateTotal));
  updateTotal();

  root.querySelector("[data-scoring]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = { scoring: { weights: Object.fromEntries(weights.map((i) => [i.name, Number(i.value) || 0])) } };
    try {
      await api("/api/settings", { method: "PATCH", body });
      await refreshSession();
      toast("Scoring weights saved.", "success");
    } catch (err) {
      toast(err.message, "error");
    }
  });

  // ---- follow-up + notifications ----------------------------------------
  root.querySelector("[data-followup]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const body = {
      followup: {
        default_interval_days: form.default_interval_days.value,
        reminder_lead_hours: form.reminder_lead_hours.value,
        daily_digest: form.daily_digest.checked,
        overdue_alert: form.overdue_alerts.checked,
      },
      notifications: {
        in_app: form.in_app.checked,
        overdue_alerts: form.overdue_alerts.checked,
        email_digest: form.email_digest.checked,
      },
    };
    try {
      await api("/api/settings", { method: "PATCH", body });
      await refreshSession();
      toast("Preferences saved.", "success");
    } catch (err) {
      toast(err.message, "error");
    }
  });

  return { title: "Settings" };
}
