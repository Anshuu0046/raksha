# Raksha: emergency SOS for women's safety

Raksha lets a woman send an emergency alert with one gesture. Her trusted contacts are notified at once
by SMS, email and push. She gets a secure live-location link, nearby police and hospitals, and one-tap
official helplines. Around that core: an "I'm Safe" check-in timer, Safe Journey monitoring, optional
audio recording, an emergency history, and an admin console that never exposes anyone's location.

It is a mobile-first, installable PWA (Next.js 16) with a JSON API designed to be reused unchanged by a
future native **Raksha Android** app.

> **Honest platform limits.** Browsers cannot detect power or volume button presses, and a web page
> cannot track location after it is closed. Raksha never claims otherwise. Hardware triggers are
> implemented behind `EmergencyTriggerProvider` and require the native Android app (see
> [docs/ANDROID.md](docs/ANDROID.md)). Raksha never calls the police automatically.

---

## Quick start (demo mode, no accounts or keys needed)

```bash
npm install
cp .env.example .env.local      # then set NEXT_PUBLIC_DEMO_MODE=true and an AUTH_SECRET
npm run dev                     # http://localhost:3000
```

In **demo mode** (`NEXT_PUBLIC_DEMO_MODE=true`):

- No real SMS, email or push is sent. Deliveries are logged and marked **simulated**.
- Emergency numbers (112, 100, 108…) are **never dialled**; the call is intercepted with a notice.
- Location is **simulated** (Bhubaneswar) and nearby places are clearly labelled demo data.
- An in-memory database is used (persisted to `.data/dev-db.json` between dev restarts).
- A **DEMO MODE** banner is shown on every screen, including the contacts' alert page.

Sign up with any email, add a contact, then press and hold SOS for 2 seconds. Open the live link from
the browser console (`JSON.parse(localStorage["raksha.emergency.v1"]).shareUrl`) or from the server
log to see what a trusted contact sees.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript) |
| `npm test` | Unit and API tests (Vitest, 84 tests) |
| `npm run test:e2e` | End-to-end tests (Playwright, uses the installed Microsoft Edge) |
| `npm run i18n:check` | Fails if a UI key is missing from `en.json` or placeholders differ; reports Hindi/Odia coverage |
| `npm run db:migrate` | Applies `supabase/migrations/*.sql` to `DATABASE_URL` |
| `npm run vapid` | Generates Web Push VAPID keys |
| `npm run icons` | Regenerates PWA icons from the brand mark |
| `npm run check` | typecheck + lint + test + build |

## What's in the box

| Area | Where |
| --- | --- |
| SOS (hold 2 s, triple tap, hold Space/Enter) | `src/components/emergency/sos-button.tsx`, `src/lib/emergency/gestures.ts` |
| Emergency engine (offline queue, live tracking, status polling) | `src/components/emergency/emergency-provider.tsx`, `src/lib/offline/outbox.ts` |
| Emergency screen + cancel flow | `src/components/emergency/emergency-screen.tsx`, `cancel-dialog.tsx` |
| Trusted-contact live page `/emergency/[token]` | `src/components/emergency/contact-portal.tsx` |
| Server emergency service | `src/lib/emergency/service.ts` |
| Notifications (Twilio / MSG91 SMS, Resend email, Web Push) | `src/lib/notifications/*` |
| Check-in & Safe Journey escalation | `src/lib/emergency/safety-timers.ts`, `src/lib/scheduler` |
| Nearby police/hospitals (OSM Overpass or Google Places) | `src/lib/maps/nearby.ts`, `src/components/maps/*` |
| Helplines (config + admin overrides) | `src/config/emergencyNumbers.ts`, `src/lib/helplines` |
| Trigger abstraction (Web / Android) | `src/lib/emergency/triggers/*` |
| Auth (password, phone OTP, Google, sessions) | `src/lib/auth/*` |
| Data layer (PostgreSQL / in-memory) | `src/lib/db/*`, `supabase/migrations/0001_init.sql` |
| PWA (manifest, service worker, offline page) | `src/app/manifest.ts`, `public/sw.js`, `public/offline.html` |
| i18n (English, Hindi, Odia) | `locales/*.json`, `src/lib/i18n/*` |
| Admin (aggregates only) | `src/app/admin`, `src/components/admin/*` |

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): system design, the SOS hot path, data model, API reference
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): Supabase + Vercel setup, environment, cron, go-live checklist
- [docs/SECURITY.md](docs/SECURITY.md): threat model and the controls in place
- [docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md): providers, DLT templates for India, retries
- [docs/ANDROID.md](docs/ANDROID.md): building Raksha Android on the same backend, hardware triggers
- [PRODUCT.md](PRODUCT.md): product record and principles; [DESIGN.md](DESIGN.md): design system

## Languages

English (complete), Hindi and Odia. All user-facing strings and every SMS, email and push template are
translated; the internal admin console is English. Alerts are sent in **each contact's** chosen
language. Hindi and Odia were machine-drafted and **must be reviewed by native speakers before a
pilot**, especially the emergency and SMS strings. Run `npm run i18n:check` after edits.

## Before a real pilot

See the go-live checklist in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#go-live-checklist). In short:
verify every helpline number for your pilot states, register DLT SMS templates, review translations,
use commercial map tiles and a geocoder with an SLA, run 1-minute cron, and test on low-end Android
devices with poor connectivity.
