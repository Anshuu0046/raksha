# Security & privacy

Raksha handles location data of people who may be in danger. The design assumes a database leak, a
malicious contact-link forwarder, and curious insiders.

## Controls

| Risk | Control | Where |
| --- | --- | --- |
| Reading another user's data | Every user-scoped query takes the owner's `userId`; tests prove cross-user reads/writes fail | `lib/db/*`, `tests/unit/authorization.test.ts` |
| Supabase key misuse | RLS enabled on every table, **no policies**, `anon`/`authenticated` revoked; app uses server-only `DATABASE_URL` | `supabase/migrations/0001_init.sql` |
| Guessable public links | 256-bit random tokens; only SHA-256 hashes stored; never DB ids | `lib/security/tokens.ts`, `lib/emergency/share.ts` |
| Links living forever | 24 h expiry (extended while she is still sharing), revoked when she is safe, rotatable, status-only for 7 days after | `lib/emergency/service.ts` |
| Link leakage | Per-contact links; `Referrer-Policy: no-referrer`, `noindex`, `no-store`; generic page title for chat previews | `next.config.ts`, `app/emergency/[token]` |
| Password theft | scrypt (N=2¹⁷), constant-time compare, dummy hash for unknown accounts | `lib/auth/password.ts` |
| Session theft | Random tokens hashed at rest; httpOnly, SameSite=Lax, Secure cookies; server-side revocation; reset signs out all sessions | `lib/auth/session.ts` |
| CSRF | SameSite cookies **and** Origin/Sec-Fetch-Site checks on cookie-authenticated writes; bearer clients exempt | `lib/api/route.ts` |
| Brute force / SMS bombing | Fixed-window limits shared via Postgres: login, signup, OTP per IP and per number, reset, SOS, uploads | `lib/security/rate-limit.ts` |
| OTP guessing | HMAC-hashed codes, 10 min expiry, 5 attempts, single use | `lib/auth/accounts.ts` |
| Injection / bad input | zod validation on every body and query; parameterised SQL; HTML-escaped emails; 64 KB JSON cap | `lib/validation.ts` |
| Leaking internals | Structured errors only; unexpected errors logged server-side, generic message returned | `lib/api/route.ts` |
| XSS / clickjacking | CSP without third-party scripts, `frame-ancestors 'none'`, `nosniff`, Permissions-Policy (camera off) | `next.config.ts` |
| Third parties learning location | Coordinates coarsened to ~110 m before Overpass/Places/Nominatim | `lib/maps/*` |
| Insider browsing | Admin APIs return aggregates and ids only, never coordinates/names/contacts; admin access is audited | `app/api/admin/*` |
| Audit | Emergency, auth, contact, share, recording, admin actions logged with a keyed IP hash | `lib/security/audit.ts` |
| Right to erasure | Account deletion removes recordings from storage, then cascades every row; audit rows are pseudonymised | `app/api/me/route.ts` |
| Cached data on shared phones | Sign-out clears offline contacts, queued requests and the service-worker page cache | `settings-view.tsx`, `public/sw.js` |

## Data minimisation

Collected: name, email and/or phone, optional photo, trusted contacts, and location **only** during an
emergency, a check-in or a journey. Contacts see her name, phone and live location only while it is
active. Recordings are device-only unless she enables upload.

## Known limitations

- In-memory rate limiting/state is per-instance in development only; production uses Postgres.
- Web Push to contacts requires them to opt in from a test message; SMS remains the baseline.
- A phone that is off cannot share location; escalations still fire server-side on time.
- The cancel flow has no duress PIN yet: a coerced cancel looks like a real one. This is a
  recommended next feature.
