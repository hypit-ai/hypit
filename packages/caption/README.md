# `@narratage/caption`

Style-family-neutral Caption contracts and deterministic whole-Atom timing.

The package owns:

- total Style assignment over an explicit `CaptionDisplaySequence`;
- generic `CaptionPlan` validation: Cue boundaries use Atom ids, fields use Word ids;
- the join of `CaptionCorrespondence` and `CompleteSemanticMap` into timed Cues and Atoms.

It owns no Script parser, concrete font, box model, field meaning, renderer, LLM, Provider or
Runtime policy.

```xml
<caption-fine:Style id="plain" recipe={studio.caption.plain}/>
<caption-fine:Style id="impact" recipe={studio.caption.impact}/>

<caption:Program id="captions" display={story.caption} default={plain}>
  <caption:Use role="ALICE" style={impact}/>
  <caption:Use words={story.caption.selection.special} style={plain}/>
</caption:Program>
```

The default covers all display Words. Ordered `Use` rules replace whole Styles; later matches win.
No rule may split a multiword Atom. `role=` is author-surface sugar for an explicit display-word
subset, not a second time-range language.

Planner freedom is limited to grouping consecutive whole Atoms into Cues and assigning declared
fields to Words inside those Cues. Timing later gives each whole Atom the measured envelope of its
explicit speech-token correspondence. It never invents per-Word timing.
