# Caption Program

Status: pre-release executable contract.

## 1. Scope

Caption is an ordinary video component family. It turns immutable authored display text into one
self-contained `VisualTrack`. It has no authority over Script wording, pronunciation, speech
alignment, Provider selection, Runtime realization or Composition order.

Its two independent graph branches are:

```text
CaptionDisplaySequence + CaptionProgram ── planner ─────────── CaptionPlan
speech audio ────────────────────────────── evidence/locator ── CompleteSemanticMap

Display + Correspondence + Plan + Program + Map ── timing ─── TimedCaptionProjection
TimedCaptionProjection + Display + Program ─────── renderer ── VisualTrack
```

Planning never receives timestamps. Alignment never receives Cue or Style judgment. The branches
meet only at the explicit timing component.

## 2. Display truth: Atom and Word

Script emits one `CaptionDisplaySequence` with two ordered views:

- `Atom` is the smallest unit a planner may place wholly into one Cue and the smallest display unit
  that can receive proven speech timing;
- `Word` is the smallest target for optional Style-owned fields.

Every Word belongs to exactly one Atom. Atoms partition Words exactly once and in order. Text and
punctuation remain author truth: `45%`, `back-and-forth`, `damn!`, `300,000`, `don't` and `U.S.A.`
cross this edge unchanged. The official Script reader is English-first and uses authored whitespace
as its normal display-word boundary; another author package may publish another policy while
producing the same public contracts.

For ordinary text, one display Word is normally one Atom. Explicit Dual Text is always one whole
Atom, even when both sides happen to contain matching words:

```svml
<New York City | new york city>
```

The display sequence contains one Atom with three Words: `New`, `York`, `City`. It does not claim
that any one display Word corresponds to any one spoken token. Hidden Dual Text (`< | um>`) produces
no display Atom.

This is intentional information discipline: Script uses all correspondence the author explicitly
provided and invents none that the author did not provide.

## 3. Speech correspondence is a separate edge

`CaptionCorrespondence` maps every display Atom to one or more authored speech-token identities.
It is separate from `CaptionDisplaySequence`; display consumers do not carry speech lineage they do
not need.

For ordinary text, each Atom maps to the speech tokens structurally owned by that display surface.
For Dual Text, the whole display Atom maps to the whole right-side speech range. There is no public
display-Word-to-speech-Word mapping and no guessed internal timing.

Script also emits `CaptionDisplayWordSubset` values for explicit Selections. Role selectors are
author-surface sugar over the same display sequence. A subset is ordered and may select zero or
more whole Atoms; selecting only part of a multiword Atom is an authoring error. These values are
not temporal `NarrativeSelection` values and do not add another `when` language.

## 4. Complete Style intent

A `CaptionStyle` is a complete author declaration with:

- universal planning requirements: preferred Cue word bounds and zero or more typed per-Word field
  declarations;
- one rendering-family identity and that family's complete Recipe-resolved parameters.

The common Caption package owns the Cue and field data shapes, not fonts, boxes, colors, animation
or the meaning of a field id. A Style family may declare no fields. Boolean, enum and bounded-number
fields are available to other families; a Word may carry zero, one or several independent fields.

SVS stores named Recipe data. A Style package interprets that Recipe and emits a complete Style.
Applying another Style replaces the whole Style; arbitrary planning and rendering pieces are never
implicitly merged.

## 5. Total assignment and ordered replacement

Every `CaptionProgram` has one explicit default Style covering the complete display universe.
Authors do not need a fake `@whole` Selection or a complement.

```xml
<caption:Program id="captions" display={story.caption} default={plain}>
  <caption:Use role="ALICE" style={alice}/>
  <caption:Use words={story.caption.selection.special} style={impact}/>
</caption:Program>
```

Uses apply in source order and the last matching whole-Style replacement wins. The Program stores
the display-sequence identity and ordered Word-id runs, not copied text. A run never crosses a
Segment or Turn boundary. All runs are disjoint and partition the display Words exactly once, and
no run may split an Atom.

`display={story.caption}` is a real graph edge. Planner, timing and rendering declare their own
edges to the same value only when they need it.

## 6. Planner contract

A planner receives resolved runs. For each run it may only:

1. group consecutive whole Atoms into ordered Cues;
2. assign declared fields to Words inside each Cue.

Cues must partition every run exactly once. Preferred minimum/maximum Cue word counts guide the
planner but cannot invalidate author text; a single multiword Atom may exceed the maximum and must
remain whole. The response contains no replacement text, pronunciation, timestamp or Style.

The Gemini planner sends the readable form only once:

```json
{
  "atoms": [
    ["new"],
    ["york"],
    ["city", "is", "beautiful"]
  ]
}
```

The outer array is the Cue-cut universe. Each inner array is one indivisible Atom. Strings inside
it are immutable field targets. Stable ids remain inside the package. A response consumes Atoms by
`atom_count`; a field uses one-based `atom_number` and `word_number` within its Cue.

## 7. Timing projection

`CompleteSemanticMap` remains the only global speech timing truth. The timing component resolves
each Atom's explicit speech-token range through `CaptionCorrespondence` and gives that whole Atom
one measured window. A Cue begins at its first Atom and ends at its last Atom.

`TimedCaptionProjection` therefore contains timed Cues and timed Atoms only. It contains no
per-display-Word timestamps, no `estimated` quality label and no proportional character split. For
a multiword Dual Text Atom, downstream renderers may choose how to lay out or animate its internal
Words, but they cannot claim invented word timing. Nothing is written back into SemanticMap.

## 8. Rendering and composition

Each timed Cue selects the complete rendering payload of its resolved Style. One Style-family
renderer returns one ordinary `VisualTrack`. In the first contract, all Styles in one Program use
the same rendering family.

`@narratage/caption-fine` is the first official family. It declares no fields and owns one
orthogonal single-font layout/Paint/motion system, including independent whole-Atom glyph,
underline and Pill activation. Another package may define a different layout tree or field-dependent
Paint without modifying Script, Caption, Composition or Core.

Film does not recognize Caption specially. It folds the resulting peer Track beside Speech,
B-roll, Text and third-party Tracks.

## 9. Explicit non-goals

Caption v1 does not define:

- Script correction or alternative wording;
- inferred Dual Text word correspondence;
- speaker diarization or speaker identity;
- implicit model or Provider routing;
- automatic cache reuse;
- estimated display-word timing;
- a global Caption layer in Composition;
- field-specific semantics in Core.

Targets, Candidates and realizations remain external run intent. They do not change Caption data or
planner semantics.
