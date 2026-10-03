---
version: 1
slug: "src-app-app-app-page-tsx"
primary_target: "src/app/(app)/app/page.tsx"
related_targets: ["src/app/emergency/[token]/page.tsx","src/app/page.tsx"]
---

# Surface: Raksha app shell (home/SOS, emergency mode, management screens) + contact portal + landing

Mode: Operate (app, portal, admin). Landing is Persuade inside the same world.
Audience/job: woman under stress, one hand, possibly at night on a weak network: trigger SOS, then call/share. Contacts: understand, locate, call, get directions.
Constraints: brief-pinned palette (deep navy/charcoal, white, emergency red, soft neutrals, safe green); no gradients, glass, decorative motion.

## Direction contract
THESIS: The app's state is the surface. Calm navy when protected, the whole screen drenched red when an emergency is active, a green band once she is safe. Refuses the category default: a white dashboard of equal cards with a red button somewhere in it.
OWN-WORLD: Night navy (#0D1B2A) home ground with white ink. Red #D91F2C is reserved for SOS, emergency mode and destructive actions only. Safe green #12804A, pending amber #B45309. Management screens use a cool neutral (#F1F3F5) ground, white panels, navy ink and 1px #DDE2E8 rules. Hanken Grotesk at 400/600/800 with tabular numerals for coordinates, times and IDs. 14px radii on controls, full-round on SOS.
STORY: She sees one enormous SOS, holds it, and the world changes colour. Checkmarks state what happened. Five large actions stay pinned. Contacts open a link and see who, where, when, plus Call and Directions.
FIRST VIEWPORT: Mobile home is a navy ground. Top: wordmark, status pill "You are protected", location and battery chips, settings icon. Centre: SOS disc at 68vw (max 288px) with a white hold ring. Below it, hold/triple-tap hints. Bottom: quick-call row (112, primary contact), then the tab bar.
FORM: brief-pinned direction; concept-seed not run (direction pinned by the user's brief). Signature move: the 2-second white hold ring that fills around the red disc, then the full-surface red takeover.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
