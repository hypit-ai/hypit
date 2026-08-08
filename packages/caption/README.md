# `@narratage/caption`

Style-family-neutral Caption contracts and timing.

The package owns four pieces of common language:

- a complete ordered `CaptionWordSequence` supplied explicitly by the Script package;
- one total `CaptionProgram`, with an explicit default Style and ordered whole-Style overrides;
- a generic `CaptionPlan`, which partitions words into Cues and assigns declared fields;
- the deterministic join from planned display words to an independent `CompleteSemanticMap`.

It does **not** own a concrete font, box model, field meaning, renderer, LLM or Provider. A Style
family such as `@narratage/caption-fine` creates complete Styles and renders the resulting Program.

```xml
<caption-fine:Style id="plain" recipe={studio.caption.plain}/>
<caption-fine:Style id="impact" recipe={studio.caption.impact}/>

<caption:Program id="captions" words={story.caption.words} default={plain}>
  <caption:Use role="ALICE" style={impact}/>
  <caption:Use words={story.caption.selection.special} style={plain}/>
</caption:Program>
```

The default covers the whole word universe. Authors do not create a fake `@whole` Selection or its
complement. Each `Use` replaces one complete Style on an explicit word subset; later matching rules
win. `role=` is author-surface sugar for a subset of the same ordered word universe. It is not a
second time-range language.

The Program stores only sequence identity and word-id-to-Style runs. It does not copy the upstream
word payload. Planner, timing and rendering packages receive `story.caption.words` through their own
explicit graph inputs.

One Style is an indivisible pair:

- common planning requirements: Cue word bounds and generic per-word field declarations;
- package-owned rendering family and opaque resolved parameters.

The planner has only two freedoms: partition each resolved run without reordering or rewriting its
words, and assign zero or more declared fields to each word. It never sees audio or time. The common
timing Producer later joins the validated Plan to Script's Caption projection and the measured
semantic map.

The package contains no LLM, Provider, credential, queue, visual renderer or Core authority.
