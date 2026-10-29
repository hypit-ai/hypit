---
title: Studio Controls for Components
description: Give a project component recognizable timeline items and useful editing controls.
---

A component can provide a Studio Companion alongside its rendering code. The Companion gives the
component a readable name and preview, identifies the objects an author can select, and exposes
Source values that are useful to edit.

## Choose recognizable objects

Use one timeline Item for one author-facing event or object. A reveal may move and then remain on a
board while still being one Item. A coordinated scene may remain one Item when its layout is meant to
be edited as a whole. Ordinary media occurrences already have suitable timeline Items and need no
additional description.

Give each Item a useful label and the interval that represents its meaning. An entrance interval can
end before the picture disappears; label it as an entrance instead of presenting it as the object's
whole lifetime. Use child lanes only when separate events are useful to select.

## Expose useful choices

Expose controls for decisions an author may intentionally change: wording, media, placement,
appearance, timing and sound. Keep implementation details inside the component. A shared Style or
Frame remains one shared decision, so editing it may update every place that references it.

Use the control that matches the value:

| Value | Suitable control |
| --- | --- |
| short or long text | text or multiline text |
| magnitude | number with useful units and limits |
| two-state choice | boolean |
| finite alternatives | select with readable labels |
| exact colour | colour with optional suggestions |
| ordered or grouped values | list or record |

Read-only labels and previews are useful when a scene should be recognizable but has no meaningful
direct edit. Do not expose every animation value merely because it exists in code.

## Check it in the composition

Open the component in its real composition. Select its picture and timeline Item, change each exposed
value, and confirm that the Source and resulting video express the same decision. Check both movement
and settled states when the component has them. For a shared value, inspect the other uses that should
change with it.

The installed [Studio Companion package README](https://github.com/hypit-ai/hypit/blob/main/packages/studio-companion/README.md)
contains the exact TypeScript API and a minimal package example. [Timing edits in Studio](./studio-temporal-windows.md)
explains how direct and projected time values behave, and [Studio](../quickstart/preview.md) introduces
the editing interface.
