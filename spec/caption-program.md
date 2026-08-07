# Caption Program

Status: implemented pre-release contract. Public names may still be polished before package
publication; the semantic laws below are executable.

## 1. Scope

Caption is an ordinary video component family. It owns the transformation from immutable authored
display text to one self-contained `VisualTrack`. It has no authority over Script wording,
pronunciation, speech alignment, global time, Composition order, Provider selection or Runtime
reuse policy.

The graph has two independent branches:

```text
Narrative.captionProjection + CaptionProgram ── planner ─────── CaptionPlan
speech audio ─────────────────────────────────── evidence/map ─ CompleteSemanticMap

Narrative + Program + Plan + Map ── temporalize ── TimedCaptionProjection
TimedCaptionProjection + Program ── render ─────── VisualTrack
```

The branches meet only at temporalization. Planning contains no timestamps, and alignment contains
no Caption Style or Cue judgment.

## 2. Display truth

Caption planning sees only the visible left side of Script. For Dual Text:

```svml
<SVML | semantic video markup language>
```

Caption sees `SVML`; speech generation and alignment see `semantic video markup language`. The
right side must never enter a Caption planning request.

The Caption package deterministically tokenizes every visible `CaptionProjection` region into an
ordered `CaptionDisplayAtom` universe. Each atom has a stable id, display text, Segment/Turn
ownership, optional Role and a source speech-token range. An atom's correspondence is either:

- `exact`: its own source speech-token range is proven;
- `region-envelope`: only the enclosing display region's speech range is proven.

The package does not invent word timing for the second case at this stage.

## 3. Complete Style intent

A `CaptionStyle` is a complete author declaration with two independent payloads:

- `planning`: one Cue instruction and zero or more typed per-atom field declarations;
- `presentation`: one complete visual appearance, presentation mode and absolute stacking order.

Styles are declared separately from where they apply. A field declaration has a stable id, value
schema, natural-language instruction and minimum/maximum assignment count per Cue. Boolean, enum
and bounded numeric values are supported. One atom may receive zero, one or multiple independent
fields; fields need not be contiguous.

A Style is a whole value. Applying another Style replaces it completely. The language does not
implicitly merge arbitrary visual properties, Cue rules or fields from two Styles.

## 4. Total assignment and ordered replacement

Every `CaptionProgram` must name one `default` Style. That Style initially owns every visible atom,
including roleless Turns. The Program then applies zero or more ordered `Use` rules:

```xml
<caption:Program id="captions" narrative={story} default={plain}>
  <caption:Use role="ALICE" style={alice}/>
  <caption:Use on={story.selection.special} style={impact}/>
</caption:Program>
```

A `Use` selector is either one exact Role label or one explicit Script Selection. It cannot contain
both. Rules run in source order; for every atom, the last matching rule wins. A rule that selects no
visible atom is an error. Authors never spell a complement merely to preserve the default.

Role is optional per Script Turn and resets at every Segment boundary. A roleless Turn therefore
receives the default unless an explicit Selection replaces it.

After assignment, the Program deterministically creates maximal contiguous runs. A run never
crosses a Segment or Turn boundary and every atom in it has one Style. Runs are disjoint, ordered and
partition the complete display universe exactly once.

## 5. Planner contract

A planner consumes resolved runs rather than interpreting Role, Selection or Style precedence. For
each run it may only:

1. split the atom sequence into one or more ordered Cues;
2. assign declared fields to atoms inside each Cue.

The result must contain every Program run exactly once. Cues must preserve order and partition the
run's atoms exactly once. Field ids, atom ids, value schemas and per-Cue cardinalities fail closed.
There is no response field for text, pronunciation, time or Style.

`@narratage/caption-gemini` is one explicit implementation of this contract. It is not part of the
Caption package or Core. Other packages may implement the same output law without being called
Gemini, but the author graph must explicitly choose them.

## 6. Timing projection

`CompleteSemanticMap` remains the only global speech timing truth. Exact display atoms reuse their
source token windows. For a `region-envelope` alias, a Caption renderer may allocate local windows
inside that region's measured envelope. Such boundaries are labelled `estimated`, remain downstream
Caption facts and are never written back into the global map.

Multiple Cues inside one alias must receive ordered, non-overlapping local windows. They must not
each copy the same whole region envelope.

## 7. Rendering and composition

Each timed Cue selects the full presentation payload of its resolved Style. The renderer may expose
declared field values to its own visual lowering, but cannot sample or mutate another Track. The
result is exactly one ordinary `VisualTrack` whose Presents carry their own frame spans and absolute
stacking facts.

Film does not recognize Caption specially. It folds the returned Track alongside Speech, B-roll,
Text or any third-party Track satisfying the same public contract.

## 8. Explicit non-goals

Caption Program v1 does not define:

- Script correction or alternative wording;
- speaker diarization or speaker identity;
- implicit model routing;
- automatic cache reuse or prompt-based memoization;
- hidden Runtime fallback;
- a global Caption layer in Composition;
- field-specific visual semantics in Core.

Reuse, Existing Values and substitutes are selected by the external BuildRequest/realization
closure. They do not change Caption data or planner semantics.
