# Author-directed time editing

The shared temporal author forms declare what Studio can edit. The tables below describe their
implemented behavior; a component's Companion also supplies the actual Source bindings.
The runtime projection types remain `@1`.

## Relationships, expressions, and resolved time

Selection and Moment name relationships in a Narrative. A Selection names two anchors; a Moment
names one. Neither carries a duration measured in seconds. Segment and Program boundaries retain
their structural meaning alongside word boundaries.

A temporal expression describes how to obtain time from those relationships or from a clock.
Projection resolves that description in a ProgramSpace. Its products are TemporalInstant and
TemporalWindow, which a component consumes to implement its own schedule and appearance.

In temporal author attributes, `{story.moment.reveal}` is a direct typed reference. Quoted values
such as `"2s"` and `"moment.cue + 2f"` are clock descriptions. Quotation marks do not themselves
produce an Instant or Window, and braces elsewhere in SVML can reference any public value type.
Both semantic references and clock descriptions reach consumers through temporal projection.
The consumer's role determines whether one Instant or a Window is needed.

The editing rule is: **edit the relationship or parameter the author exposed, preserving the
relationship they chose to depend on.** Knowing where a result came from does not by itself grant
an inverse that changes that source.

## Direct bindings

| Author form | Move | Leading edge | Trailing edge |
| --- | --- | --- | --- |
| `during={story.selection.proof}` | Move both Selection anchors by the same number of semantic stops; duration may change. | Change its start anchor. | Change its end anchor. |
| `at={story.moment.reveal}` for an Instant | Change the Moment anchor. | Not applicable. | Not applicable. |
| `at={story.selection.proof} boundary="start"` for an Instant | Change only the Selection start anchor. | Not applicable. | Not applicable. |
| `at={story.selection.proof} boundary="end"` for an Instant | Change only the Selection end anchor. | Not applicable. | Not applicable. |
| `during={story.segment.opening}` or `during="program"` | Follow the structural span; no timeline write. | No timeline write. | No timeline write. |
| A directly selected Segment boundary | Follow that structural boundary; no timeline write. | Not applicable. | Not applicable. |

A shared Selection or Moment is edited once in Script. All its consumers follow after compilation.
An item's placement in a track does not make its own private copy of that relationship.

Word starts, word ends, Segment starts, and Segment ends are equally eligible semantic anchors.
Selection starts do not inherently prefer word starts; Selection ends do not inherently prefer
word ends. Endpoints can include pauses by referring to the appropriate neighboring anchor.

## An event and a duration

These forms expose two independent decisions: an event or clock position, and a duration.

| Author form | Move | Leading edge | Trailing edge |
| --- | --- | --- | --- |
| `at={story.moment.reveal} for="8f"` | Change the Moment; keep `for`. | No handle. | Change `for`; keep the Moment. |
| `until={story.moment.reveal} for="8f"` | Change the Moment; keep `for`. | Change `for`; keep the Moment. | No handle. |
| `at="2s" for="8f"` | Change `at`; keep `for`. | No handle. | Change `for`; keep `at`. |
| `until="2s" for="8f"` | Change `until`; keep `for`. | Change `for`; keep `until`. | No handle. |

Moving an event-and-duration window preserves duration. Moving a direct Selection window preserves
semantic step displacement instead. These are different author decisions, so they have different
behavior even when their current rectangles look identical.

The unavailable edge does not secretly edit both the event and the duration. Duration editing is
frame-based; semantic event editing selects an anchor. There is no `at` plus `until` Window form:
current forms are `during`, `at/for`, `until/for`, and `start/end`.

## Clock positions and explicit offsets

A literal Instant such as `at="2s"` exposes one numeric time and can move by rewriting that value.
A reference expression exposes a local offset while retaining its referenced event:

```svml
moment={story.moment.reveal}
instant="moment.cue + 2f"
```

Moving this Instant changes the signed offset only. It does not relocate the Moment in Script.
The same rule applies to an explicit offset from a selected boundary or a Program boundary.
The expression's reference remains unchanged through the write.

A bare reference expression such as `instant="moment.cue"` has an implicit zero offset. Moving it
writes an offset such as `moment.cue+3f`; it leaves the Moment in Script unchanged. The direct
binding `at={...}` is the form that edits the Moment itself.

Bare references and explicit `+0f` have the same editing behavior. Writeback uses an explicit frame
offset, including at zero. Positive, zero, and negative offsets belong to the same editing operation,
subject to the resulting projection being usable.

The existing syntax uses `instant` for expressions and a separate typed `moment`, `selection`, or
`segment` attribute to bind their source. This design does not add an implicit name resolver or
put arithmetic inside `{...}`. Unifying surface attribute spellings is a separate usability choice,
not a prerequisite for establishing these edit semantics.

## Independently authored endpoints

`start="..." end="..."` expresses a deliberately assembled Window. Its expressions may use different
sources, boundaries, absolute times, and offsets. This form remains available for production,
including pure motion graphics and windows extending around a spoken passage.

Each endpoint is edited exactly like an Instant expression: a literal changes its absolute time;
a reference changes its local offset. A leading trim changes `start`, a trailing trim changes `end`,
and a whole-window move shifts both endpoints by the same frame delta. Each expression retains its
own reference, even when the endpoints depend on different sources. The referenced Script markers
remain unchanged. Companion bindings identify the two writable source parameters.

## Seconds and frames

Seconds and milliseconds describe clock duration; frames describe steps at the ProgramSpace's
frame rate. `2s` remains two seconds when the rate changes, whereas `60f` spans two seconds at 30fps
and one second at 60fps. Parsing retains that authored unit. Projection uses exact rational arithmetic
and rounds the resulting position to the nearest frame boundary, with half-frame ties rounding later.

Timeline gestures operate on whole frames in the current ProgramSpace. A changed absolute value is
written in frames, and a changed reference expression receives a frame offset. Unedited expressions
retain their spelling and units. This makes a drag's result exact at the current frame rate without
silently converting all authored clock durations into frame counts.

## Semantic stops and coincident anchors

Script order, anchor identity, and projected frame position are separate data:

- Script order determines which inline Selection an author surface can express.
- Projected frame position determines where an event appears in the current performance.
- Anchor identity determines which relationship survives later changes to that performance.

Build the gesture's semantic stops from distinct projected frame positions in chronological order.
Several anchors at one frame occupy one stop but retain their individual identities. A direct
Selection move advances both endpoints by the same signed number of stops. It does not shift a raw
anchor-array index, assume one stop is one word, or preserve a duration measured in frames.

Ties first retain the current anchor where it is still a candidate, then prefer its kind, then use
a stable declared order. This is a default choice among coincident candidates, not a hierarchy of
valid anchors. Selecting a semantic marker shows its exact anchors in the Inspector. Where declared
handles allow it, a choice lists the other anchors at the same frame; horizontal mouse position alone
cannot distinguish them. That explicit choice uses the same Script adjustment operation as dragging.

Segment overlap or gaps can change temporal order without changing Script order. Stop construction
must not assume contiguous Segments. The current SemanticTrack implementation still concatenates
Take durations; introducing explicit Take placement is separate work.

## Selection, projection, and consumption

A Selection that is forward in Script may locate to equal or reversed frame endpoints. This does
not alone establish whether every use of that Selection is invalid. A consumer may use only its
start, or an expression may add offsets before composing a Window.

Script validates the relationship it can express. Temporal projection validates the resulting
Instant or Window in its ProgramSpace. Components validate their own use of those results.
Studio offers only gestures with a declared inverse and candidate targets that preserve the
edited object's usable projection. It does not add a global positive-duration rule to Selection.

Both endpoints of a range adjustment are written in one operation. Recompilation remains the check
for effects on other consumers of the shared relationship. An unsuccessful publication leaves the
previous source and displayed state in place through the existing source transaction; this does not
introduce a Build recovery workflow or a second mutable source of truth.

A hidden or invalid initial object does not need an automatic repair interface. Conversely, a valid
editable object must not disappear because the editor committed a target its own projection cannot
represent. The relevant closure is over meaningful relationships and supported operations, not every
possible raw spelling of the document.

## Implementation ownership

The existing protocol already distinguishes `TemporalSource` from `TemporalInstantAuthority`.
Preserve this separation. A source says what time depends on; authority identifies an intentional
write target. The `fixed` case means no temporal gesture writes that endpoint, not that all author
parameter editing is forbidden.

- `@hypit/script` owns tokenization, anchor identities, legal marker sites, and structural writeback.
  It normalizes equivalent marker whitespace, retains punctuation and attributes, writes coincident
  markers together, and preserves all unrelated relationships and caption information.
- `@hypit/temporal-markup` owns the interpretation of each time form and declares its write targets.
  Direct semantic references expose semantic targets; quoted time expressions expose parameter
  targets, including implicit zero offsets and independent endpoints. Structural bindings retain
  their structural boundaries without a timeline write target.
- `@hypit/temporal` resolves time and validates its results. It does not infer a user editing choice
  from invertibility or know Studio's UI.
- Companion/Studio translates those declared relationships into the finite operations above.
  Existing `after-start` and `before-end` duration relationships already distinguish event-and-duration
  windows. Explicit source bindings remain the write allowlist. Component names and media types
  do not decide which operation is available.

Script tests exercise repeated marker moves and return trips across English, Chinese, Dual Text,
punctuation, token attributes, and empty Segments. Temporal Markup tests check author authority;
Studio tests check handles, semantic-stop movement, projected validity, and offset writes through zero.
The same semantic gesture projection is used for the timeline preview and server-side validation.
