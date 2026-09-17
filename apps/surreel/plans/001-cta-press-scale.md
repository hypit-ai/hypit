# 001 — Add 160ms press scale to primary CTAs

- **Status**: DONE
- **Commit**: f13701d1
- **Severity**: HIGH
- **Category**: Physicality & origin
- **Estimated scope**: 2 files

## Problem

Primary actions had InkWell/Material splash only. `design.md` names CTA press as a motion primitive. AUDIT requires `scale(0.97)` at 160ms ease-out.

`apps/surreel/lib/ui/workspace.dart` Queue video and Send, and `apps/surreel/lib/ui/review_deck.dart` Keep / Skip, had no scale.

## Target

```dart
// apps/surreel/lib/ui/design.dart
static const Duration press = Duration(milliseconds: 160);
// PressScale: AnimatedScale 0.97, curve StudioMotion.enter Cubic(0.16, 1, 0.3, 1)
// StudioMotion.of zeroes duration when MediaQuery.disableAnimations is true
```

## Repo conventions to follow

- Tokens live in `StudioMotion` / `PressScale` in `apps/surreel/lib/ui/design.dart`
- Exemplar: `PressScale` wrapping `FilledButton.icon` for Queue video

## Steps

1. Shipped: `PressScale` + wrap Queue video, New video, Keep, Skip, Send, empty-state actions.
2. Do not add press scale to NavigationBar destinations.

## Boundaries

- Do NOT add page-transition motion.
- Do NOT add a second duration token besides `press` (160) and `short` (180).
- Do NOT add dependencies.

## Verification

- **Mechanical**: `cd apps/surreel && flutter test`
- **Feel check**: press Queue video; it shrinks to 0.97 and returns in 160ms. Reduced-motion: no scale travel.
- **Done when**: `PressScale` is the only press primitive and keys `create-video`, `keep-review`, `skip-review` still resolve.
