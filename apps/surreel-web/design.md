# Design - Surreel

A locked design system for the Surreel studio. App surfaces read this file
before visual changes. Do not regenerate per page. Amend this file when the
system needs to grow.

## Genre
atmospheric

## Macrostructure family
- Marketing pages: none in this app
- App pages: Photographic (film or format still is the fold; type is caption)
- Content pages: none

## Theme
Night lime. Paper is cool forest charcoal. Lime is the only chromatic note.
Neutrals stay on hue 145. Accent sits on hue 126. Dark canvas only.

- `--color-paper`      oklch(19.5% 0.014 145)
- `--color-sidebar`    oklch(16.2% 0.012 145)
- `--color-paper-2`    oklch(24.8% 0.016 145)
- `--color-paper-3`    oklch(29.8% 0.018 145)
- `--color-ink`        oklch(95.8% 0.014 135)
- `--color-ink-2`      oklch(73.8% 0.030 145)
- `--color-hint`       oklch(61.8% 0.022 145)
- `--color-rule`       oklch(36.8% 0.020 145)
- `--color-accent`     oklch(82.0% 0.170 126)
- `--color-accent-ink` oklch(19.8% 0.048 142)
- `--color-focus`      oklch(82.0% 0.170 126)
- `--color-error`      oklch(81.8% 0.072 32)

## Typography
- Display: Space Grotesk, weight 500, roman
- Body: DM Sans, weight 400
- Mono: none
- Display tracking: -0.04em
- Type scale: display 40 / 32 / 24, body 15 / 13 / 12

## Spacing
4-point named scale in `tokens.css`. Touch targets use `--space-touch` (48).

## Breakpoints
- The studio is a single 430px column on every width.
- Phone: width under 600. Safe-area padding on mast and dock.
- Larger widths keep the same column, centered on the canvas.

## Motion
- Personality: Premium (Night lime). Signature `--ease-premium` `(0.4, 0, 0.2, 1)`.
- Easings: `--ease-out` enter; `--ease-in` leave; `--ease-premium` on-screen deck
- Duration palette: press 160 / pager 400 / pager exit 280
- Reveal: none on app pages
- Interaction: swipe format pager, swipe review deck, primary press
- Format pager: 7 stills on a Y-axis wheel. Primary rotateY + translateZ. Secondary facing-camera counter-rotate. Ambient front shadow after settle. Swipe turns the wheel. No overshoot. No opacity-only.
- Press: scale 0.97, 160ms
- Format still hover: scale 1.04, 180ms
- Reduced-motion: durations collapse; pager snaps without travel

## Microinteractions stance
- Silent success
- Focus ring immediate
- Max three motion primitives: pager/dots, CTA press, swipe deck

## CTA voice
- Primary: accent fill, 10px radius, verb ("Queue 7 takes", "Keep", "Send")
- Secondary: paper-2 fill, ink text, same radius
- Dock: N5 pill, content-sized, not edge-to-edge

## Per-page allowances
- App pages must not use marketing enrichment, manifesto heroes, or spark cards
- Queue is a URL fold. A public page selects every Hypit angle until the user turns some off. Written brief sits in Details.
- Review is a full-bleed stack. Keep / Skip only.
- Socials is one film to send, then a strip of opened films.
- Formats is a folio of the same playbook stills.

## What pages MUST share
- Surreel mark and wordmark
- Lime accent at or under 5% of a viewport
- Space Grotesk + DM Sans
- 10px controls, 8px inputs, 14px cards, pill dock
- No italic headings, no em dash, no second accent

## What pages MAY differ on
- Queue uses a format still pager
- Review uses a stacked film
- Formats uses a vertical folio
- Project detail uses a preview plus notes

## Exports

React tokens live in `tokens.css`. This file is the source of truth
for colour, type, and CTA voice. Do not introduce a second palette.

Served product: Vite + React in `apps/surreel-web`. Flutter in `apps/surreel` is kept on disk and is not the default `pnpm surreel` surface.
