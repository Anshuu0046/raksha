# Deployment (Supabase + Vercel)

## 1. Database (Supabase)

1. Create a Supabase project in the **Mumbai (ap-south-1)** region.
2. Copy two connection strings from *Project Settings → Database*:
   - **Transaction pooler** (port 6543) → `DATABASE_URL` (used by the app on Vercel).
   - **Direct connection** (port 5432) → `MIGRATION_DATABASE_URL` (used only for migrations).
3. Run migrations from your machine:
   ```bash
   MIGRATION_DATABASE_URL="postgresql://…:5432/postgres" npm run db:migrate
   ```
   This enables RLS on every table with no policies and revokes `anon`/`authenticated` access.
   Do **not** expose Supabase's anon key in the frontend. Raksha does not use it.
4. *(Recordings)* Storage → create a **private** bucket named `recordings`. Set `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` (server-only). Without these, uploads are disabled in production and
   recordings stay on the device.

## 2. Providers

| Need | Env vars | Notes |
| --- | --- | --- |
| Sessions/OTP | `AUTH_SECRET` (≥32 chars) | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| SMS | `SMS_PROVIDER=twilio` + `TWILIO_*`, or `msg91` + `MSG91_*` | India requires DLT templates: see [NOTIFICATIONS.md](NOTIFICATIONS.md) |
| Email | `RESEND_API_KEY`, `EMAIL_FROM` | Verify your sending domain (SPF/DKIM) |
| Push | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `npm run vapid` |
| Google login | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Redirect URI `https://<domain>/api/auth/google/callback` |
| Places | `GOOGLE_PLACES_API_KEY` (optional) | Without it, OpenStreetMap Overpass is used |
| Tiles | `NEXT_PUBLIC_MAP_TILE_URL`, `NEXT_PUBLIC_MAP_ATTRIBUTION` | Use a commercial provider for a pilot; the CSP allows its host automatically |
| Geocoding | `NOMINATIM_URL`, `GEOCODER_CONTACT_EMAIL` | Public Nominatim allows ~1 req/s: self-host or use a provider |
| Admins | `ADMIN_EMAILS` | Promoted to admin on sign-in |
| Cron | `CRON_SECRET` | Vercel sends it as a Bearer token |

## 3. Vercel

1. Import the repository; framework preset **Next.js**; Node 20+.
2. Add all environment variables above for *Production* (and *Preview* with demo mode if you like).
   Set `NEXT_PUBLIC_APP_URL=https://your-domain` and `NEXT_PUBLIC_DEMO_MODE=false`.
3. `vercel.json` schedules `/api/cron/process` **every minute**. Per-minute cron needs a paid Vercel
   plan. On the Hobby plan, call the endpoint every minute from an external scheduler instead, for
   example Supabase `pg_cron` + `pg_net`:
   ```sql
   select cron.schedule('raksha-tick', '* * * * *', $$
     select net.http_get(
       url := 'https://your-domain/api/cron/process',
       headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
     ) $$);
   ```
   User traffic also triggers opportunistic ticks, but **cron is what guarantees** escalation when
   nobody has the app open.
4. Set the function region to **bom1 (Mumbai)** close to the database.

## 4. Self-hosting

`npm run build && npm start` behind HTTPS (the app sets HSTS and Secure cookies in production).
Run the cron URL every minute with any scheduler (systemd timer, Kubernetes CronJob).

## Go-live checklist

- [ ] Every helpline in `src/config/emergencyNumbers.ts` re-verified for the pilot states; state
      overrides added in `/admin/helplines`.
- [ ] Hindi and Odia reviewed by native speakers, especially SOS, cancel, portal and SMS text.
- [ ] DLT templates approved and template IDs configured (MSG91), or Twilio sender registered for India.
- [ ] Test notification sent to a real phone on every channel; delivery visible in `/admin`.
- [ ] Cron firing every minute (`/admin` shows check-ins resolving; logs show ticks).
- [ ] Commercial map tiles and geocoding with an SLA; nearby search verified in pilot cities.
- [ ] `NEXT_PUBLIC_DEMO_MODE=false`; `AUTH_SECRET` and `CRON_SECRET` are long random values.
- [ ] Tested on low-end Android (2 GB RAM), Chrome, 3G throttling and airplane-mode transitions.
- [ ] Incident runbook: who watches `/admin` delivery failures and provider status.
- [ ] Privacy policy and terms reviewed by counsel (DPDP Act 2023); data retention decided.
