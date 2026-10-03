# Raksha design system

Recorded from the shipped build (`src/app/globals.css`, `src/components/ui/*`). The governing idea:
**the app's state is the surface.** Calm night navy when she is protected, the whole screen drenched
red during an emergency, a green field once she is safe.

## Color

| Token | Value | Use |
| --- | --- | --- |
| `navy-900` | `#0d1b2a` | SOS home ground, primary buttons, top bars |
| `navy-950` | `#07111c` | Tab bar, desktop rail, offline bar, dark actions on red |
| `navy-300` / `navy-200` | `#a7b8cc` / `#cdd8e5` | Secondary text on navy (≥8:1) |
| `ground` / `surface` / `line` | `#f1f3f5` / `#ffffff` / `#dde2e8` | Management screens |
| `ink` / `ink-2` / `ink-3` | `#0d1b2a` / `#3a4757` / `#566273` | Text on light grounds (≥5.6:1) |
| `sos` | `#d91f2c` | SOS disc, primary emergency CTAs only (white text 5.0:1) |
| `sos-deep` | `#a8101c` | Emergency screen ground (white text 7.6:1) |
| `sos-tint` | `#ffd6da` | Secondary text on `sos-deep` |
| `safe` / `safe-ink` | `#12804a` / `#0d6b3d` | "I'm safe", resolved states, ended screen |
| `warn` | `#a34a06` | Overdue timers, setup gaps, DEMO MODE strip |

Rules: red appears only for SOS, an active emergency, or destructive actions. Green means safe. No
gradients, glass or decorative motion.

## Type

Hanken Grotesk (self-hosted via `next/font`) at 400/500/600/700/800, falling back to Noto
Devanagari/Odia and Nirmala UI for Hindi and Odia. Display: 800 weight, tracking −0.02 to −0.04em
(`EMERGENCY ACTIVE`, page titles 28–32px). Body 15–17px. Every number that updates (timers,
coordinates, IDs, distances) uses `tabular-nums` (`.tabular`).

## Shape, depth, spacing

Controls 14px radius (`--radius-control`), panels 18px (`--radius-panel`), SOS fully round. Panels
use a soft two-layer shadow (`--shadow-panel`); sheets and menus use `--shadow-lift`. Touch targets
are ≥48px; emergency actions are ≥64px; the SOS disc is `min(68vw, 288px, 38dvh)`.

## Signature interactions

- **Hold ring:** a white arc fills around the red disc over the hold duration, with a countdown inside.
  Releasing early cancels. Three quick taps or holding Space/Enter also work.
- **State takeover:** the emergency layer covers every route in `sos-deep`, with a status checklist
  and six actions pinned in thumb reach (Call police, Call ambulance, Call contact, Share location,
  Record audio, Cancel).
- **Two-step cancel:** choose a reason, then confirm; "Keep emergency active" is the larger target.

## Components

`Button` (default, sos, safe, outline, subtle, ghost, danger, onDark, onDarkSolid; sm–xl), `Field` +
`Input`/`NativeSelect`/`Textarea` (labels, hints, and errors announced via `aria-describedby`),
`Switch`/`SwitchRow`, `Dialog` (bottom sheet on phones, centred on desktop), `Notice` (info, warn,
error, success, offline), `Badge`, `Panel`, `PageHeader`, `CallButton` (demo-safe `tel:`).

## Layout

Mobile: navy SOS home and a 5-tab bar (Home, Nearby, Contacts, Journey, History), with a navy top bar
on inner pages linking to Helplines and Settings. Desktop (≥1024px): a navy rail with all
destinations; the home splits into a sticky SOS column and a column of daily tools.
