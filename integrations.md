# External integrations

LeadRescue ships with a real outbound architecture for email, WhatsApp and SMS. Credentials
are read from the **server environment only** — never from the browser, never stored in the
database, never returned by an API response.

When a channel is not configured:

1. `POST /api/comms/send` responds `409` with code `PROVIDER_NOT_CONFIGURED` and a message
   naming the missing variables.
2. The attempt is stored in `messages` with status `failed` and the reason, so the history
   stays truthful.
3. The UI shows the channel as **Needs configuration** and offers "Log as manual contact"
   instead, which records the interaction without claiming a delivery.

## Email — Resend

```bash
RESEND_API_KEY=re_xxxxxxxx
RESEND_FROM="LeadRescue <follow-ups@yourdomain.com>"
```

1. Create a Resend account and verify the sending domain (SPF/DKIM records).
2. Create an API key with send permission.
3. Set both variables and restart the process.

Sending path: `POST https://api.resend.com/emails` (see `src/services/mailer.js`).

## SMS — Twilio

```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_FROM=+15551234567
```

1. Buy or port an SMS-capable number in Twilio.
2. Copy the account SID and auth token from the console.
3. Set the three variables and restart.

Sending path: `POST /2010-04-01/Accounts/{sid}/Messages.json` with HTTP Basic auth.

## WhatsApp — Meta WhatsApp Cloud API

```bash
WHATSAPP_TOKEN=EAAG...
WHATSAPP_PHONE_ID=1234567890
```

1. Create a Meta app with the WhatsApp product, add a business phone number.
2. Generate a permanent system-user token with `whatsapp_business_messaging`.
3. Use the phone number ID (not the display number) and restart.

Sending path: `POST https://graph.facebook.com/v20.0/{phone_id}/messages`.

### WhatsApp template caveat

Outside a 24-hour customer service window, Meta only allows approved message templates.
LeadRescue sends plain text messages, which is correct for replies inside the window. For
cold outreach you must register and approve a template in Meta Business Manager and extend
`sendWhatsApp` in `src/services/mailer.js` to send a `template` payload instead of `text`.

## Consent and opt-out

- `leads.consent` is `unknown`, `granted` or `revoked`; `leads.opted_out` mirrors revocation.
- Sending is refused with `409 CONSENT_BLOCKED` when consent is revoked or the customer opted out.
- WhatsApp and SMS additionally require recorded consent (`409 CONSENT_REQUIRED` when unknown).
- Consent changes are logged in the `activity` table and shown on the lead record.

This is a technical control, not legal advice. Check the rules that apply to your business
(GDPR/PECR, TCPA, local marketing law) and keep proof of consent where required.

## Email digest / invitations

Invitations are single-use links created in **Team → Invite**. No email is sent
automatically, on purpose: the link is generated for you to share through a channel you
control. Email digests are a preference flag; wiring them to a scheduler is a deployment
task, and the UI states that they require a configured provider.

## Google Search Console

Not a messaging integration, but treated with the same "no fake success" rule: verification
is only reported as working after the production HTML and verification file have been fetched
and checked. See `docs/seo-search-console.md`.
