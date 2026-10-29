# Make a component useful in Studio

Read this while deciding how a project component should appear and be edited in Studio.
[Studio](studio.md) owns opening and operating the editor; [component design](component-design.md)
owns the component's creative boundary. Use the installed Studio Companion package README for exact
TypeScript interfaces.

A Companion describes two things: **what an author can recognize and select**, and **which authored
choice an edit changes**. Keep those concepts consistent across the picture, timeline and Inspector.

## Choose useful Items and lanes

Use one Item for one meaningful author-facing object or event. A reveal can move and then remain on a
board while still being one Item. A coordinated presenter-and-diagram scene can remain one Item when
its layout is intended to be edited together. Ordinary media occurrences already have suitable Items.

Give every Item:

- a stable identity within the component instance;
- a readable title and, when useful, a thumbnail or material preview;
- the interval whose meaning the author is editing;
- child lanes only for independently useful events.

An entrance interval may end before the object disappears. Present it as an entrance instead of
calling it the object's lifetime. Overlapping Items may share a lane when they remain independently
selectable.

## Keep rules and occurrences distinct

Timeline Items represent occurrences or events. Track-wide rules such as Caption presentation choices
belong in the Inspector. Independently selectable child content can use a child lane of its own.

Picture selection and timeline selection should identify the same authored object. Link the visible
parts that realize that object, including movement and settled states when both belong to it. Do not
duplicate drawing geometry in the Companion.

## Expose author decisions

Expose controls for actual Source or Recipe choices: content, placement, appearance, timing and sound.
A useful semantic event may deserve a timeline handle without exposing every animation key. A visual
number inside drawing code need not become a public control until an author has a reason to change it.

| Control | Useful choice |
| --- | --- |
| `text` | Wording or a meaningful expression; multiline for longer text. |
| `number` | Magnitude, with appropriate units, scale and limits. |
| `boolean` | An actual two-state choice. |
| `select` | Preset, font, alignment or another finite choice, with readable labels. |
| `color` | Exact colour, optionally with suggested swatches. |
| `list` / `record` | An ordered list or named group edited as one value. |

Shared Source or Recipe values should remain shared: editing one updates every use that references it.
Read-only facts and previews are sufficient when direct editing would have no clear author meaning.

## Preserve the authored time decision

An Item's editable time should point to the Source value that expresses its meaning. A Script Selection
changes through its semantic anchors; a direct Timeline expression changes through its authored time;
a local offset remains a separate local choice. Several components may intentionally share one timing
value, so changing it updates all of them.

If a displayed interval has no unique meaningful edit, keep it inspectable without offering a drag or
trim operation.

## Check the complete interaction

Try the component in its real composition:

1. Select a meaningful picture part and confirm the same timeline Item is selected.
2. Change each exposed value and inspect the owning Source or Recipe.
3. Recompile and check that the resulting picture expresses the same decision.
4. Inspect movement and settled states when both belong to the component.
5. For shared timing or style, inspect the other consumers too.

Package the Companion with the project component and follow the installed package README for build and
loading details. Restart Studio after changing package code; ordinary Source and Recipe edits update
through the current session.
