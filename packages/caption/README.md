# `@hypit/caption`

External components use `@hypit/hypit/caption` from their `@hypit/hypit` development dependency. The package
owns the types and helpers below; Source imports retain the `@hypit/caption@1` Module identity.


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
or `attribute`; `Mute` selects a Role or Selection. For Role/Selection applications, the last matching
`Use` in Source order selects the complete Style for each unit. It replaces the previous choice
without merging Style parameters. A Selection can cover a phrase, a whole Segment, several Segments
or the program through its structural anchors; there is no separate Segment selector.

Word attributes produce separate `wordRuns`. Conflicting Styles on the same attributed word are
rejected; these runs do not use the Role/Selection override rule. A family chooses whether and how
it supports word-specific runs.

Mute applications combine their selected unit ids independently of Style order. They suppress those
display words, preserving the speech and semantic timeline. Visible lead and tail still belong to
the family schedule, so muting a word is not a time-based mask of every neighboring Cue.

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

That family can render a standalone Caption Track or coordinate caption text with graphics in a
shared scene. Its output uses ordinary VisualTrack elements or a renderer program with explicit
resources. Caption retains the authored words and their semantic relationship while the component
owns the visual boundary. The Program does not automatically route different families to different
renderers; choose the implementing component and its coverage explicitly.
