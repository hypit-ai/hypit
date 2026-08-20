# `@hypit/caption`

Style-family-neutral Caption contracts and deterministic whole-Atom timing.

The package owns:

- total Style assignment over an explicit `CaptionDisplaySequence`;
- generic `CaptionPlan` validation: Cue boundaries use Atom ids, fields use Word ids;
- the join of `CaptionCorrespondence` and `SemanticTrack` into timed Cues and Atoms.

It owns no Script parser, concrete font, box model, field meaning, renderer, LLM, Provider or
Runtime policy.

```xml
<caption-fine:Style id="plain" recipe={recipes.caption.plain} font={caption-font}/>
<caption-fine:Style id="impact" recipe={recipes.caption.impact} font={caption-font}/>

<caption:Program id="captions" display={story.caption} default={plain}>
  <caption:Use role="ALICE" style={impact}/>
  <caption:Use words={story.caption.selection.special} style={plain}/>
  <caption:Mute words={story.caption.selection.private}/>
</caption:Program>
```

`Mute` is a post-planning whole-Atom visibility rule. It does not change Script truth, Gemini
input, Cue cuts, semantic timing, or Core. The common Caption timing join omits those Atoms from
the timed visual projection while preserving each surviving Cue's original identity and span.

The default covers all display Words. Ordered `Use` rules replace whole Styles; later matches win.
No rule may split a multiword Atom. `role=` is author-surface sugar for an explicit display-word
subset, not a second time-range language.

Planner freedom is limited to grouping consecutive whole Atoms into Cues and assigning declared
fields to Words inside those Cues. Timing later gives each whole Atom the measured envelope of its
explicit speech-token correspondence. It never invents per-Word timing.
