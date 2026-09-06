# `@hypit/caption`

The deterministic Caption contract. Script emits one `CaptionDocument` containing display words,
N:M alignment units and authored `||` cue breaks. Caption applies Styles to complete units selected
by a Role or a semantic Selection, then joins those units to a `SemanticTrack` for frame timing.

```xml
<caption:Program id="captions" document={story.caption} narrative={story} default={plain}>
  <caption:Use role="HOST" style={impact}/>
  <caption:Use selection={story.selection.emphasis} style={plain}/>
  <caption:Use attribute="emphasis" style={keyword}/>
</caption:Program>
```

There is no planner, model call or frame range in this authoring contract. A Selection is projected
to complete alignment units before timing; a Selection that cuts through an N:M unit is rejected.
Script-native word attributes are resolved separately as local word Style runs and do not create
another timing source. They are part of the common Caption contract for structural Caption families;
`@hypit/caption-fine` deliberately rejects them because Fine requires one uniform token rule per Cue.

`TimedCaptionProjection` is intentionally not a `TemporalWindow` collection. Cue timing is a
read-only projection of token evidence, not an author-controlled placement window. It nevertheless
carries the exact `spaceId`, `narrativeId` and `documentId`, so another SemanticTrack or Script cannot
be substituted silently.

## Extending with another rendering family

The common public values are defined in [types.ts](src/types.ts), with exports in
[index.ts](src/index.ts). A family supplies:

- a Style decoder producing `CaptionStyleIntent` with its own `rendering.family` and validated
  `rendering.parameters`;
- an optional family schedule Type and deterministic scheduling Producer;
- a rendering Producer returning the ordinary `VisualTrack` Type;
- a Surface/Fragment connecting the common document, program and timing to those Producers.

`caption:Program` remains the common author Surface. `Use` selects exactly one of `role`, `selection`
or `attribute`; `Mute` selects a Role or Selection. Overlapping unit Style applications are resolved
in authored order, while word attributes produce separate `wordRuns`. This is explicit application,
not CSS inheritance. A family chooses whether and how it supports word-specific runs.

Reuse `captionProducers.temporalizeDocument` with inputs `document`, `semantic` and `program`, or the
corresponding exported timing Fragment. It emits a `TimedCaptionProjection` whose Cues contain
`styleId`, `startFrame`, `endFrameExclusive` and measured `units`. Each unit carries `unitId` and its
own boundaries. Recover display Words and their associations from the same `CaptionDocument`; do
not infer N:M timing by evenly dividing a Cue or splitting its rendered string.

Scheduling may derive visible intervals while preserving those measured boundaries. Use
`assertCaptionProgramForDocument`, `assertTimedCaptionProjection` and, for visible scheduling,
`applyCaptionMute` as appropriate. Retain `spaceId`, `narrativeId` and `documentId` in a schedule so
the renderer can check its inputs. The renderer should consume that schedule without silently
changing Cue grouping, lead or tail again.

`@hypit/caption-fine` provides a working example in its `src/fragment.ts`, `src/schedule.ts` and
`src/render.ts`: one shared timing join, then family schedule and render operations. A new structural
family replaces Fine's uniform-word layout and parameters, not the common speech truth. Its own
Manifest, activation and vocabulary belong to the project package; no change to this common package
is required merely to add a new visual family.
