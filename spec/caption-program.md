# Caption Program

Status: pre-release contract under implementation. Public names may still be polished before
package publication; the semantic laws below are the target for executable tests.

## 1. Scope

Caption is an ordinary video component family. It owns the transformation from immutable authored
display words to one self-contained `VisualTrack`. It has no authority over Script wording,
pronunciation, speech alignment, global time, Composition order, Provider selection or Runtime
reuse policy.

The graph has two independent branches:

```text
CaptionWordSequence + CaptionProgram ── planner ────── CaptionPlan
speech audio ────────────────────────────────── evidence/map ─ CompleteSemanticMap

Narrative + Words + Program + Plan + Map ── temporalize ── TimedCaptionProjection
TimedCaptionProjection + Words + Program ── Style renderer ── VisualTrack
```

The branches meet only at temporalization. Planning contains no timestamps, and alignment contains
no Caption Style or Cue judgment.

## 2. Display truth and word subsets

Caption planning sees only the visible left side of Script. For Dual Text:

```svml
<SVML | semantic video markup language>
```

Caption sees `SVML`; speech generation and alignment see `semantic video markup language`. The
right side must never enter a Caption planning request.

Script deterministically projects every visible `CaptionProjection` region into one explicit,
ordered `CaptionWordSequence`. This is the complete Caption word universe `W`; it is not a bag of
strings. Each `CaptionWord` has a stable id and global index, display text and source offsets,
Segment/Turn ownership, optional Role, and a source speech-token range. A word's correspondence is
either:

- `exact`: its own source speech-token range is proven;
- `region-envelope`: only the enclosing display region's speech range is proven.

The package does not invent word timing for the second case at this stage.

Script additionally emits ordered `CaptionWordSubset` values for explicit Selections. Role
ownership is already explicit on each word, so the Caption author Surface can derive the equivalent
Role subset directly from the sequence. A subset contains only ids from the exact
`CaptionWordSequence` and preserves their global order. Selection-to-word projection is a
Script/source-structure concern: Caption never reads token indices, source ranges or marker affinity
from a general `NarrativeSelection`.

This creates two deliberately different projections of one authored Selection:

- the general `NarrativeSelection` contains only semantic start/end anchor identities and can be
  located in time by any consumer;
- the Caption-specific `CaptionWordSubset` names visible display words wholly owned by that
  Selection and can be used before time exists.

The two values are not interchangeable and neither is hidden metadata on the other. A Selection
that cuts only part of an indivisible Dual Text display region cannot become a Caption word subset;
the author must split the Dual Text atom.

## 3. Complete Style intent

A `CaptionStyle` is a complete author declaration with two inseparable payloads:

- `planning`: universal Cue word-count bounds plus zero or more Style-owned typed per-word field
  declarations and their instructions;
- `rendering`: the owning Style family identity plus that family's complete, Recipe-resolved
  parameters.

Styles are declared separately from where they apply. The common Caption contract owns Cue
partitioning and field assignment shapes, but it does not own fonts, colors, box layout, animation
modes or the meaning of any field id. Those belong to concrete Style families. A Style family may
declare no fields at all: the accepted `@narratage/caption-fine` direction uses only Cue partitioning
and one uniform static appearance for every word in a Cue.

A field declaration has a stable id, value schema, natural-language instruction and
minimum/maximum assignment count per Cue. Boolean, enum and bounded numeric values are supported.
One word may receive zero, one or multiple independent fields; fields need not be contiguous.

A Style is a whole value. Applying another Style replaces it completely. The language does not
implicitly merge arbitrary visual properties, Cue rules or fields from two Styles. Planning and
rendering cannot be selected independently: replacing a Style replaces both. This prevents a
planner from emitting a field that the selected renderer does not understand.

SVS stores named Recipe data. A Style package parses the Recipe into its own complete parameters
and emits the common `CaptionStyle` envelope. SVS does not understand Caption fields or rendering.

## 4. Total assignment and ordered replacement

Every `CaptionProgram` names one explicit `default` Style. That Style initially owns every word in
`W`, including roleless Turns. The word universe itself is the whole set: authors must not write
`@whole ... @/whole` merely to style all captions, and the compiler must not invent such an authored
time Selection.

`words={story.caption.words}` is a real graph input, not payload to copy through every downstream
value. The Program stores the sequence identity and ordered word-id-to-Style runs only. Planner,
temporalizer and Style renderer each declare their own explicit edge to the same word sequence when
they need word text or source correspondence.

The Program then applies zero or more ordered whole-Style replacements:

```xml
<caption:Program id="captions" words={story.caption.words} default={plain}>
  <caption:Use role="ALICE" style={alice}/>
  <caption:Use words={story.caption.selection.special} style={impact}/>
</caption:Program>
```

An author Surface may offer `role="ALICE"` as sugar, but it must resolve to the explicit Role word
subset before the Program is constructed. It is not a temporal Selection and it introduces no
fourth `when` language.

Rules run in source order; for every word, the last matching rule wins. A rule that selects no
visible word is an error. Role is optional per Script Turn and resets at every Segment boundary. A
roleless Turn therefore receives the default unless an explicit word subset replaces it. Authors
never spell a complement merely to preserve the default.

After assignment, one deterministic resolver creates maximal contiguous runs. A run never crosses
a Segment or Turn boundary and every word in it has one Style. Runs are disjoint, ordered and
partition the complete display universe exactly once. It does not create one graph node per Style.

## 5. Planner contract

A planner consumes resolved runs rather than interpreting Role, Selection or Style precedence. For
each run it may only:

1. split the word sequence into one or more ordered Cues, respecting the Style's common minimum and
   maximum word count;
2. assign declared fields to words inside each Cue.

The result must contain every Program run exactly once. Cues must preserve order and partition the
run's words exactly once. Field ids, word ids, value schemas and per-Cue cardinalities fail closed.
There is no response field for text, pronunciation, time or Style.

`@narratage/caption-gemini` is one explicit implementation of this contract. It is not part of the
Caption package or Core. Other packages may implement the same output law without being called
Gemini, but the author graph must explicitly choose them.

## 6. Timing projection

`CompleteSemanticMap` remains the only global speech timing truth. Exact display words reuse their
source token windows. For a `region-envelope` alias, a Caption temporalizer may allocate local
windows inside that region's envelope. Those local boundaries remain downstream Caption facts and
are never written back into the global map.

Multiple Cues inside one alias must receive ordered, non-overlapping local windows. They must not
each copy the same whole region envelope.

## 7. Rendering and composition

Each timed Cue selects the full rendering payload of its resolved Style. One Style-family renderer
consumes all runs of that family, including the default and every override, and returns exactly one
ordinary `VisualTrack`. The renderer may interpret its own declared fields, but cannot sample or
mutate another Track. In v1 every Style in one Program must name the same rendering family; mixing
families requires separate Programs/Tracks until a real cross-family composition contract exists.

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
- field-specific visual semantics in Core;
- a condition language parallel to Selection, Moment or Caption word subsets.

Reuse, Existing Values and substitutes are selected by the external BuildRequest/realization
closure. They do not change Caption data or planner semantics.
