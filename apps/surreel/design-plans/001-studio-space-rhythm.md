# Map remaining gaps to StudioSpace

Written against: f13701d1

## Evidence chain

- Surface: Surreel workspace Queue / Review / Socials / Formats (`apps/surreel/lib/ui/workspace.dart`)
- Problem: `design.md` requires named `StudioSpace` gaps. Several composer, dialog, and sidebar values stay literal (`22`, `28`, `52`, `11`).
- Design evidence: `apps/surreel/design.md` Spacing: "Widgets use those names, not ad-hoc gaps."
- Owner: `apps/surreel/lib/ui/design.dart` `StudioSpace`
- Scope and affected surfaces: `workspace.dart` sidebar, dialogs, empty-state padding; `project_view.dart` if it still uses literals
- Uncertainty: none for the contract. Exact mapping of `22` to `md` (16) vs `lg` (24) needs a look at the rendered group.

## Design decision

Replace leftover literal `SizedBox` / padding numbers with `StudioSpace.xs|sm|md|lg|xl`. Do not invent a new token unless a value is required and is not 4, 8, 16, 24, or 40.

## Reuse

- `StudioSpace` in `apps/surreel/lib/ui/design.dart`
- Exemplar: `_queuePage` and `_compactQueue` after the phone workbench pass

If a new primitive is required, state why the existing system cannot express the decision, where the primitive belongs, and which consumers should share it.

## Changes

1. `apps/surreel/lib/ui/workspace.dart`
   - Change: sidebar `28`/`22`, empty-state `52`/`9`, dialog `20`/`22` to named tokens
   - Preserve: labels, keys, nav destinations, Queue / Review / Socials / Formats copy
   - Verify: `flutter test test/workspace_test.dart` still passes

## Scope

- Inherit: any widget already importing `design.dart`
- Verify: `apps/surreel/lib/ui/project_view.dart`
- Exclude: Hallmark colour tokens, format playbooks, API review states

## Validation

- Product: enqueue, swipe Keep, send caption still work
- Interface: 390×844 and 1440×900
- System: no second spacing class
- Repository: `cd apps/surreel && flutter test` → all tests pass

## Stop conditions

- Stop if `design.md` gains a different scale or Hallmark amends spacing.

## Design documentation

- After acceptance and validation: none. The named-scale rule is already in `design.md`.
