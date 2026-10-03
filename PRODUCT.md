# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 16 (App Router) + TypeScript + React 19 + Tailwind CSS 4 + shadcn/ui-style components + Lucide.
Data: Supabase-hosted PostgreSQL (confirmed), reached only from the server. Raksha runs its own session
auth (confirmed) so the web app and the future native Android app share one backend: an httpOnly cookie on the web, a Bearer token on Android.
Every table has RLS enabled with no client policies. Deploy target: Vercel serverless (confirmed),
with Vercel Cron driving check-in/journey escalation and notification retries.

## Users

Primary: women in India who want a fast way to get help when they feel unsafe, often outdoors, at night,
alone, holding the phone in one hand, under stress, sometimes on a weak mobile connection.
Secondary: their trusted contacts (parents, siblings, partners, friends) who receive an alert, often on a
different phone, without a Raksha account, and must understand within seconds what happened, where she is,
and how to reach her.
Tertiary: Raksha administrators who maintain helpline numbers and watch system health, without browsing anyone's
location history.

## Product Purpose

Trigger an emergency alert within seconds and, automatically, notify trusted contacts, share live location
through a secure temporary link, and surface nearby police, hospitals and official helplines. Around that core:
scheduled safety check-ins, Safe Journey monitoring with escalation to contacts, optional audio recording,
and an alert history. Success: a press-and-hold on one button reaches every trusted contact with a working live
location link, even on a poor network, and nothing in the emergency path asks her to fill a form or confirm twice.

## Positioning

An emergency product, not a dashboard. Honest about platform limits: the web/PWA does everything browsers
actually allow; hardware power/volume-button triggers are explicitly reserved for the native Raksha Android app,
which reuses the same API.

## Operating Context

- Goal: real pilot launch (confirmed). Demo mode (`NEXT_PUBLIC_DEMO_MODE=true`) exists for development and
  demonstrations and never sends real SMS, never dials real emergency numbers, and uses simulated location.
- Indian emergency numbers (112, 100, 108, 181, 1091, 1098) vary by state; numbers live in a config file and
  an admin-editable table, never in UI components.
- Contacts receive SMS, email, and (when they opt in from an invite link) web push.

## Capabilities and Constraints

- Browsers cannot intercept hardware buttons; never claim they can.
- Background tracking in a browser stops when the page is closed; live location is "while Raksha is open".
- Never auto-call police. Escalations notify trusted contacts first.
- Never expose raw DB ids as public tokens; share tokens are random, hashed at rest, expiring and revocable.
- Three UI languages (confirmed): English, Hindi, Odia. Hindi and Odia copy was machine-drafted and
  needs native-speaker review before pilot (open item).

## Evidence on Hand

No testimonials, user counts, partner logos or press exist. Do not fabricate any. Example persona name in
templates and demo data: "Ananya" (synthetic).

## Product Principles

1. The emergency path is one gesture long. Everything after the hold is automatic.
2. Assume bad connectivity: queue, retry, and always keep direct calling and SMS one tap away.
3. Say exactly what happened and what did not (sent, pending, failed, simulated). Never pretend.
4. Minimal data, short-lived links, no casual access, even for admins.
5. Calm in daily use, unmistakable in an emergency.

## Accessibility & Inclusion

WCAG 2.2 AA minimum. Large touch targets (≥48px, primary emergency actions ≥64px), one-handed reach,
screen-reader labels, keyboard activation of SOS (hold Space/Enter), reduced motion, high contrast,
Indic scripts rendered with system Noto/Nirmala fallbacks.
