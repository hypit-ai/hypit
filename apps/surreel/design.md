# Design - Surreel

A locked design system for the Surreel studio. App surfaces read this file
before visual changes. Do not regenerate per page. Amend this file when the
system needs to grow.

## Genre
atmospheric

## Macrostructure family
- Marketing pages: none in this app
- App pages: Workbench (format rail + composer; lists without manifesto heroes)
- Content pages: none

## Theme
Night lime. Paper is cool forest charcoal. Lime is the only chromatic note.
Neutrals stay on hue 145. Accent sits on hue 126. Dark canvas only.

- `--color-paper`      #111711  oklch(19.5% 0.014 145)
- `--color-sidebar`    #0B0F0B  oklch(16.2% 0.012 145)
- `--color-paper-2`    #1C231C  oklch(24.8% 0.016 145)
- `--color-paper-3`    #283028  oklch(29.8% 0.018 145)
- `--color-ink`        #EDF3EA  oklch(95.8% 0.014 135)
- `--color-ink-2`      #9FB09F  oklch(73.8% 0.030 145)
- `--color-hint`       #7E897E  oklch(61.8% 0.022 145)
- `--color-rule`       #394239  oklch(36.8% 0.020 145)
- `--color-accent`     #A9D750  oklch(82.0% 0.170 126)
- `--color-accent-ink` #071B06  oklch(19.8% 0.048 142)
- `--color-focus`      #A9D750
- `--color-error`      #EEB3A7  oklch(81.8% 0.072 32)

## Typography
- Display: Space Grotesk, weight 500, roman
- Body: DM Sans, weight 400
- Mono: none
- Display tracking: -0.04em
- Type scale: display 40 / 32 / 24, body 15 / 13 / 12

## Spacing
4-point named scale in `lib/ui/design.dart` (`StudioSpace`). Widgets use those
names, not ad-hoc gaps. Touch targets use `StudioSpace.touch` (48).

## Breakpoints
- Phone: width under 600. Format chips scroll sideways. Page titles use 24.
- Compact workbench: width under 1050. Bottom nav. Queue CTA is a sticky bar.
- Split queue: width 980 and up. Format rail at 860. Sidebar at 1050.

## Motion
- Easings: cubic-bezier(0.16, 1, 0.3, 1) enter; cubic-bezier(0.7, 0, 0.84, 0) leave
- Reveal: none on app pages
- Interaction: format selection and primary press only
- Press: scale 0.97, 160ms, `StudioMotion.enter`, `PressScale`
- Template hover: scale 1.04, 180ms, same enter curve
- Reduced-motion: `StudioMotion.of` zeroes duration; MediaQuery.disableAnimations

## Microinteractions stance
- Silent success
- Hover delay none on chips; focus ring immediate
- Max three motion primitives: chip select, CTA press, template hover scale

## CTA voice
- Primary: accent fill, 10px radius, verb ("Queue video", "New video", "Keep", "Send")
- Secondary: hairline rule, ink text, same radius

## Per-page allowances
- App pages must not use marketing enrichment, manifesto heroes, or spark cards
- Queue is a workbench: format first, then the playbook fields, then the live pipeline. On a phone the Queue video control stays in the thumb zone above the nav.
- Review is a card stack. Keep / Skip only. No manifesto. Preview height 220 on phone.
- Socials is an outbox. Caption copy plus an honest platform handoff. Send is full width under the title on phone.
- Formats is a photographic index of the same playbooks

## What pages MUST share
- Surreel mark and wordmark
- Lime accent at or under 5% of a viewport
- Space Grotesk + DM Sans
- 10px controls, 8px inputs, 14px cards
- No italic headings, no em dash, no second accent

## What pages MAY differ on
- Queue uses a format rail
- Review uses a stacked card
- Formats uses image cards
- Project detail uses a preview + activity split

## Exports

Flutter tokens live in `lib/ui/design.dart`. This file is the source of truth
for colour, type, and CTA voice. Do not introduce a second palette.
