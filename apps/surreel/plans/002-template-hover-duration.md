# 002 — Cap Formats card hover at 180ms

- **Status**: DONE
- **Commit**: f13701d1
- **Severity**: MEDIUM
- **Category**: Easing & duration
- **Estimated scope**: 1 file

## Problem

`apps/surreel/lib/ui/templates.dart` used `Duration(milliseconds: 380)` on `AnimatedScale`. UI budget is under 300ms. Hover is tens/day on Formats.

## Target

```dart
duration: StudioMotion.of(context, StudioMotion.short), // 180ms
curve: StudioMotion.enter, // Cubic(0.16, 1, 0.3, 1)
scale: _hovered ? 1.04 : 1,
```

## Repo conventions to follow

- `StudioMotion.short` is the existing UI duration
- Exemplar: `ReviewDeck` leave delay already used `StudioMotion.of(context, StudioMotion.short)`

## Steps

1. Shipped: replace 380ms with `StudioMotion.short` and `StudioMotion.enter`.

## Boundaries

- Do NOT change card copy, images, or tap handlers.
- Do NOT raise hover scale above 1.04.

## Verification

- **Mechanical**: `cd apps/surreel && flutter test test/workspace_test.dart`
- **Feel check**: Formats hover settles in one short beat. Reduced-motion: scale stays at 1.
- **Done when**: no `380` duration remains in `templates.dart`.
