# `@narratage/caption`

Provider-neutral Caption planning, timing projection and lowering to an ordinary peer
`VisualTrack`.

Caption has two independent inputs:

- `Narrative.captionProjection` is the immutable display truth. Only the left side of Dual Text is
  visible here; `<SVML | semantic video markup language>` contributes the display atom `SVML`, not
  its pronunciation words.
- `CaptionProgram` is the complete author intent for planning and presentation. It assigns exactly
  one full `CaptionStyle` to every visible display atom.

A Style contains both its planning requirements and its complete visual appearance. The Program
names one default Style and then applies ordered whole-Style replacements by Role or explicit
Script Selection. Later matching applications win. Consequently roleless prose and every
unmentioned word receive the default automatically, while changing one sentence needs only one
Selection and one `Use`; the author never writes the complement.

```xml
<caption:Style id="plain" appearance={studio.caption.plain}>
  <caption:Cues>Use complete phrases of two to five words.</caption:Cues>
</caption:Style>

<caption:Style id="impact" appearance={studio.caption.impact}>
  <caption:Cues>Use complete phrases of two to seven words.</caption:Cues>
  <caption:Field id="important" type="boolean" min-per-cue="0" max-per-cue="2">
    Select at most two words whose emphasis best communicates this Cue.
  </caption:Field>
</caption:Style>

<caption:Program id="captions" narrative={story} default={plain}>
  <caption:Use role="ALICE" style={impact}/>
  <caption:Use on={story.selection.special} style={plain}/>
</caption:Program>
```

`Use` order is semantic. The second rule above replaces the entire Style for `special`; it does not
merge arbitrary fields from two styles. A Role Cue is optional in Script, and Role state never
crosses a Segment boundary.

The planner-neutral `CaptionPlan` has only two freedoms:

1. partition each already-resolved Program run into ordered Cues;
2. assign zero, one or more declared attributes to each display atom.

It cannot rewrite text, change Style assignment or invent time. `temporalize-caption-plan` later
joins those atom identities with the independent `CompleteSemanticMap`. Exact display/speech
correspondence reuses measured timing. A display alias without word-level audio evidence receives
an explicitly estimated local projection and never contaminates the global speech map.

The final `render-caption-program` Producer lowers the timed result and each selected full Style to
one self-contained `VisualTrack`. Caption is not a privileged Composition layer: Film consumes it
exactly like Speech, B-roll or Text Track output.

The package owns deterministic Types, validators and Producers only. It contains no LLM, Provider,
credential, queue or Core authority. A planning package such as `@narratage/caption-gemini` may fulfill
the narrow `CaptionPlan` contract; presentation and timing remain here.
