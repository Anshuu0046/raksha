# Architecture

## Overview

```
 Raksha Web (PWA, Next.js)          Raksha Android (future, Kotlin)
 ─ SOS button / keyboard            ─ volume / power / lock-screen triggers
 ─ WebEmergencyTriggerProvider      ─ AndroidEmergencyTriggerProvider (WebView bridge) or native UI
          │  cookie session                     │  Bearer token
          └──────────────┬──────────────────────┘
                         ▼
        Next.js route handlers  /api/*   (Node runtime, Vercel)
        route() wrapper: auth → CSRF → rate limit → zod → handler → structured errors
                         │
      ┌──────────────────┼────────────────────────────────┐
      ▼                  ▼                                ▼
 Repository        Notification dispatcher          Maps / geocoding
 (PostgreSQL on    SMS (Twilio | MSG91)             Overpass or Google Places,
  Supabase, or     Email (Resend)                   Nominatim (coarsened coords)
  in-memory)       Web Push (VAPID)
                         ▲
        /api/cron/process (Vercel Cron, every minute) + opportunistic ticks:
        check-in / journey escalation, notification retries
```

Every private endpoint authenticates with **the same session system** whether the caller is the web
app (httpOnly cookie) or Android (`Authorization: Bearer`). Supabase is used as managed PostgreSQL
(and Storage for recordings). Every table has RLS enabled with **no policies**, so Supabase's public
keys can read nothing and all access goes through the API's authorization checks.

## The SOS hot path

Optimised so the alert leaves the phone before anything else happens:

1. **Gesture completes** (hold 2 s / triple tap / hold Space). The UI switches to the red emergency
   screen immediately and the phone vibrates. No confirmation screen.
2. The client generates a `clientEventId` (idempotency key) and **persists the trigger to the
   outbox in localStorage** *before* sending, using the last known position (a fresh GPS fix is not
   awaited). The request uses `keepalive`, so it completes even if the tab closes.
3. `POST /api/emergency/trigger` writes the event, first location and *pending* notification rows in one
   go, mints the owner's share link and **responds** (~tens of ms). Maps, geocoding and delivery do
   not block the response.
4. After the response (`after()` → Vercel `waitUntil`), the dispatcher claims each notification row
   atomically, mints a **per-contact** share link, renders the message in the contact's language, and
   sends SMS/email/push to all contacts **in parallel**. Reverse geocoding fills in the address.
5. The client starts high-accuracy `watchPosition`, queues points (≥10 s apart or >15 m moved) through
   the same outbox, and polls `/api/emergency/status` (3 s, then 15 s) to show the
   "Contacts notified / Location shared / Live tracking" checklist from real delivery state.

**Bad network:** the outbox persists across reloads, retries with backoff, keeps the trigger ahead of
location points, and re-runs immediately if something is enqueued mid-flush. The server de-duplicates
retries by `clientEventId`. While offline, the emergency screen offers `tel:` and an `sms:` link to the
primary contact with a Google Maps link to the last known position. Both work without data.

**Cancel** needs two deliberate steps (choose "I'm safe" / "Triggered by mistake", then confirm). It can
be addressed by `clientEventId`, so an SOS whose response was lost can still be cancelled. Ending an
emergency revokes all share links (they then show only "safe" for 7 days) and notifies everyone
who was alerted.

## Escalations (never the police)

- **Check-in**: at `dueAt` a reminder push goes to her own device. At `dueAt + grace` (default 10 min)
  an escalation emergency is created and **trusted contacts** are notified, with a live link if she
  allowed it. A late "I'm safe" resolves it and tells contacts.
- **Safe Journey**: a reminder at the expected arrival time; at `+grace` only the contacts she chose
  are alerted with the last known position.
- Driven server-side (cron + opportunistic ticks), so it works even if her phone is off. Status
  transitions are atomic (`transitionCheckIn/transitionJourney`), so two workers cannot double-escalate.

## Data model

`supabase/migrations/0001_init.sql`: `users`, `sessions`, `auth_tokens`, `otp_codes`, `trusted_contacts`,
`push_subscriptions`, `emergency_events`, `emergency_locations`, `emergency_shares`, `notifications`,
`check_ins`, `safe_journeys`, `emergency_numbers`, `recordings`, `audit_logs`, `rate_limits`.

Notable constraints and indexes: one primary contact per user (partial unique index); one active
check-in / journey per user; `(user_id, client_event_id)` unique for SOS idempotency;
`(event_id, recorded_at desc)` for latest location; due-work partial indexes for the scheduler.
All timestamps are `timestamptz`; the domain layer uses ISO-8601 strings.

The repository interface (`src/lib/db/repository.ts`) takes the owner's `userId` on every user-scoped
read, so authorization is part of the query. `MemoryRepository` implements the same interface for
development, demo mode and tests; production refuses to start without `DATABASE_URL` unless demo
mode is on.

## API reference

All responses: `{ "success": true, "data": … }` or
`{ "success": false, "error": { "code": "…", "message": "…", "details"?: […] } }`. Codes are listed in
`src/lib/api/errors.ts`. Stack traces are never returned.

| Method & path | Auth | Purpose |
| --- | --- | --- |
| `POST /api/auth/signup` · `login` · `logout` | – | Email/password. `client: "android"` returns a bearer token |
| `POST /api/auth/otp/request` · `otp/verify` | – | Phone OTP (rate-limited per IP **and** per number) |
| `POST /api/auth/password/forgot` · `password/reset` | – | Reset link (30 min, single use, signs out everywhere) |
| `GET /api/auth/google/start` · `google/callback` | – | Google OAuth (PKCE) |
| `GET /api/auth/providers` | – | Which sign-in methods are available |
| `GET·PATCH·DELETE /api/me` | user | Profile, preferences, onboarding; secure account deletion |
| `POST /api/emergency/trigger` | user | Start SOS (idempotent by `clientEventId`) |
| `POST /api/emergency/location` | user | One or a batch (≤50) of positions |
| `POST /api/emergency/cancel` | user | End as `safe` / `mistake` (by `eventId` or `clientEventId`) |
| `GET /api/emergency/status[?eventId]` | user | Event, latest location, per-notification delivery |
| `POST /api/emergency/share` | user | New live link (optionally revoke all old ones) |
| `GET /api/history` (alias `/api/emergency/history`) | user | Timeline without coordinates |
| `GET·POST /api/contacts`, `PATCH·DELETE /api/contacts/{id}` | user | Trusted contacts (max 10) |
| `POST /api/contacts/{id}/primary` · `/test` | user | Set primary; send labelled test message |
| `POST /api/notifications/send` | user | Client-initiated sends (test only, by design) |
| `POST·DELETE /api/push/subscribe`, `GET /api/push/public-key` | user / – | Her own device's push |
| `GET·POST /api/checkin`, `POST /api/checkin/complete` | user | Start; complete / cancel / extend |
| `GET /api/journey`, `POST /api/journey/start` · `location` · `complete` | user | Safe Journey |
| `GET /api/nearby?lat&lng&category&radius` | user | Facilities sorted by distance |
| `GET /api/geocode/reverse` · `search` | user | Address lookup, destination search |
| `GET /api/helplines?region=IN-OR` | optional | Resolved helplines for a region |
| `GET·POST /api/recordings`, `GET·DELETE /api/recordings/{id}` | user | Upload ≤4 MB segments; owner-only download |
| `GET /api/public/emergency/{token}` | token | What a trusted contact sees |
| `GET·POST /api/public/alerts/{token}` | token | Contact opts a device in to push |
| `GET /api/cron/process` | cron secret | Scheduler tick |
| `GET /api/admin/stats`, `GET·PUT·DELETE /api/admin/helplines` | admin | Aggregates; helpline overrides |
| `GET /api/health` | – | Liveness (DB ping) |

## Frontend structure

- `src/app/app/*`: signed-in app (Home/SOS, Nearby, Helplines, Contacts, Journey, History, Settings),
  wrapped by `AppDataProvider` (user, contacts and helplines, cached on device for offline),
  `LocationProvider` (permission-aware geolocation, never prompts on load) and `EmergencyProvider`.
- The emergency screen is a full-surface layer above every route, so SOS state is never hidden by
  navigation.
- Maps (Leaflet + OSM tiles) are lazy-loaded and never on the SOS path; map failures fall back to the
  list and coordinates.
- i18n: the server picks the locale (user setting → cookie → Accept-Language), passes one dictionary
  to the client; missing keys fall back to English, never to blank.
