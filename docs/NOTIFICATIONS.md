# Notifications

## Delivery model

1. A notification row is written for every reachable channel of every contact **before** anything is
   sent (`status: pending`). A crash mid-delivery leaves a retryable record.
2. The dispatcher **atomically claims** each row (`claimNotification`, a 2-minute lease), so the
   post-response hook and the cron worker can never double-send.
3. Contacts are processed in parallel; each gets a **per-contact** live link minted at send time.
4. Results: `sent`, `simulated` (demo), `failed` (retried at +30 s, +2 min, +10 min; 4 attempts max),
   or `skipped` (permanent: provider not configured, invalid number, no channel).
5. When an emergency ends, everyone who was alerted gets a "safe" / "false alarm" follow-up.

Messages are rendered in the **contact's** language (`locales/<code>.json` → `notify.*`). Times use
`APP_TIMEZONE` (default Asia/Kolkata).

## SMS in India (DLT)

Commercial SMS in India must use templates registered on a DLT platform. Register these (wording is
indicative; variables in MSG91 syntax) and put the IDs in the environment:

| Env | Purpose | Example template |
| --- | --- | --- |
| `MSG91_SOS_TEMPLATE_ID` | SOS alert | `EMERGENCY ALERT: ##name## may need help. Location: ##link## -Raksha` |
| `MSG91_OTP_TEMPLATE_ID` | Sign-in code | `Your Raksha code is ##otp##. It expires in 10 minutes. Do not share it.` |
| `MSG91_GENERIC_TEMPLATE_ID` | Updates, check-in/journey alerts, tests | `##message## -Raksha` |

Use a **transactional/service-implicit** route. Twilio works too (`SMS_PROVIDER=twilio`) but Indian
delivery also requires sender and template registration through Twilio.

## Email

Resend HTTP API (`RESEND_API_KEY`). Emails include status, time, location with accuracy, address,
battery, her phone number, the live link and a Google Maps link. All user text is HTML-escaped.

## Web Push

- **Her device:** subscribed from onboarding/Settings. Used for check-in and journey reminders.
- **Contacts:** a test message includes an invite link (`/alerts/<token>`) where the contact turns on
  alerts. Subscriptions are stored against the contact; expired endpoints (404/410) are removed.
- Urgent alerts use `urgency: high`, `requireInteraction` and a strong vibration pattern.
- iPhone: push works only for PWAs added to the Home Screen (iOS 16.4+). The UI explains this.
