# Make a component useful in Studio

Read this while adding timeline meaning, picture selection or author controls to a project
component. [Studio](studio.md) owns opening and operating the editor;
[component design](component-design.md) owns the component's creative boundary.

The Companion describes two things: **what an author can recognize and select**, and **which
authored fact an edit changes**. Keep the same concepts across the picture, timeline and Inspector.
A reveal can be one entity even when its graphic moves and later remains on a board. A coordinated
presenter-and-diagram scene can stay one entity when its layout is intended to be edited together.

## Choose useful entities and lanes

Match the component's actual Module ABI, Surface and terminal output Type. Generic VisualTrack or
AudioTrack entities are enough for simple occupancy. Use `project(context)` when the author needs
domain meaning that the terminal drawing no longer contains. A Surface preview supplies a useful
static recognition image; live entities and editable bindings come from the Companion.

For example, a board can expose its outer lifetime and its individual reveal events. Publish the
deterministic schedule/program needed to describe these from the same Surface, then request its
exact output port through `requiredValues`. `requiredSurfaceValue(context, "schedule")` reads that
published output. `requiredReferencedValue` reads an exact typed author reference instead.

| Declaration | Authoring meaning |
| --- | --- |
| Companion label, tone, icon and `lane.heightPx` | Recognize the component and give its information enough room. |
| Entity id and authored identity | Select the same authored object after recompilation or reordering. Qualify child ids across component instances. |
| `display.title` and display layers | Show useful content, text or declared media rather than an opaque implementation id. |
| `startFrame`, `endFrameExclusive` | Describe what this rectangle edits: occupancy, activation or another explicit interval. |
| `stackOrder` | Order overlapping editor entities; this is separate from changing the Film's paint order. |
| Companion `attachments` and entity `lane` | Expose a meaningful child lane, such as reveals under a board, with its own fields. |

Each declared lane is one row. Overlapping items remain selectable; selection raises the selected
rectangle within that row. Parent and attached lanes use the same behavior. Add a child lane when
it explains another authoring relationship, such as activation within a persistent board.

An activation rectangle may end before the object disappears. Keep the activation's editable range
and the object's continuing picture identity distinct. The installed Ranking Companion demonstrates
this with board, reveal and activation lanes.

## Connect the picture to the entity

Associate the actual rendered parts with `presentId` or `renderIds`. All phases belonging to the
same item can select that item: entrance, movement and settled appearance. Give the board/background
parts to the parent and the reveal's parts to its child when separate selection is useful.

The renderer's explicit `subjectId` can associate multiple rendered phases with one domain item;
the Companion carries their actual ids into `renderIds`. Studio uses the visible parts at the
current frame. This preserves selection after an icon lands without duplicating animation geometry
in the Companion. A preset with no separately exposed child remains part of the parent entity.

Picture selection and timeline selection identify the same authored object. Position and size can
then be adjusted through its declared Inspector fields.

## Expose decisions, not implementation debris

Declare `bindings` for the actual author endpoints, then choose visible `inspector` fields. A
binding can follow a shared authored Frame or Style through `referenced`, or an SVS Recipe through
`recipe`. Use `parameterReferences` for an entity's actual reference, such as the Style selected
for this Caption Cue. Shared values retain their shared effect when edited.

Where describes placement and layout. When describes timing, playback and motion. How describes
appearance, content and sound. Each Companion chooses useful pages and sections within them.

| Control | Useful choice |
| --- | --- |
| `text` | Wording or a meaningful expression; `multiline` for longer text. |
| `number` | Magnitude, with appropriate units, scale and limits. |
| `boolean` | An actual two-state choice. |
| `select` | Preset, font, alignment or another finite choice, with readable labels. |
| `color` | Exact hex color, optionally with suggested `swatches`. |
| `list` / `record` | A schema-described ordered list or named set of values, edited as one Apply/Reset draft. |

For a Surface with a literal `label` attribute, a minimal declaration is:

```ts
bindings: [{ name: "label", writable: true }],
inspector: [{
  binding: "label", label: "Label", domain: "how",
  section: { id: "content", label: "Content" }, control: "text",
}],
```

The Surface already owns `label`; the Companion exposes it. A width stored as `"78%"` can use
`control: "number", number: { suffixes: ["%", "px"] }`: editing 42 retains the existing suffix.
An opacity stored as `0.78` can use `unit: "%", number: { scale: 100, minimum: 0, maximum: 100 }`:
the control shows 78 and entering 42 writes 0.42. `unit` alone is a display label. Suffix handling
retains an authored unit; it does not convert percentages to pixels.

Select options may be plain strings or `{ value, label, description, preview }` entries. Color and
font previews are small visual hints; the actual option value is written. A font hint uses a family
available to the editor, while the production font remains an explicit resource as described in
[fonts and text](fonts-and-text.md). The component's schema owns valid author values. Studio
performs the declared conversion, serializes in the source language and saves the owning file.

## Preserve the timing decision through editing

Carry the real Window/Instant lineage into each entity. For a domain Spec consumed beside a
projection, `temporalLineageFor(context, item.id, "activation")` follows that actual consumer input;
use the real input name, such as `window`, `outer` or `activation`. `authoredChildFor` and
`childEntities` connect domain child identities to their exact author origins.

The [authored time form](studio.md#edit-the-owning-source-fact) determines the edit: a direct
Selection changes its two Script anchors, a direct Moment changes one anchor, and a quoted clock
expression changes its local time or offset. A projected frame alone does not establish that
relationship. Several objects can consume the same Selection or Moment; changing it updates them
all through normal compilation. A separate offset remains a separate local decision.

## Load it with the project package

Keep the Companion separate from the component's Producers. External packages import
`@hypit/hypit/studio-adapter` and relevant public `@hypit/hypit/*` APIs, with the Distribution as a
development dependency. Add `createStudioTrackCompanionHostFacet(companions)` to the existing
activation's `hostFacets`, retaining its author and producer contributions. Ship the compiled
Companion through the package's normal activation entry.

The Source-selected package activates its Companion. Restart Studio after changing package code
or activation. Ordinary Source and Recipe edits recompile within the current session.

Use the installed `packages/studio-adapter/README.md` for the complete minimal Companion and
activation example, `packages/studio/INSPECTOR.md` for field declarations, and
`packages/temporal-markup/EDITING.md` for exact time-form behavior. These are package references
inside the installed Distribution. Ranking, Caption Fine and Media Track Companions demonstrate
persistent events, per-Cue styles and material occupancy respectively.

Try the component in its actual Run: select a meaningful picture part, inspect the corresponding
timeline entity, change an exposed value and inspect the owning Source and resulting picture.
For a shared timing edit, inspect the other consumers too. Seek into both movement and settled
states when those belong to the component's behavior.
