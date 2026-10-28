# `@hypit/caption`

External components import `@hypit/caption`. Source uses the `@hypit/caption@1` Module
identity for shared declarations such as `Hidden`.

`Hidden` is owned by Caption's syntax-neutral Author declaration compiler. Markup contributes the
`Hidden` tag spelling, while direct and textual authorship produce the same `CaptionStyle` Record.

Caption has independent content, timing and presentation structures: CaptionDocument owns display
Words, correspondence Units and authored Cues; CaptionTiming locates every Unit; and each rendering
family presents those Cues before timed Uses choose how they appear. A Use may begin inside a Cue. It
changes presentation without changing that Cue's content or restarting its Unit timing.

`CaptionDocument` owns displayed words with authored separators, display units, word attributes and
complete Cue membership. Every Word belongs to exactly one Unit and every Unit belongs to exactly
one Cue, in document order. A Cue may carry one Role. The document contains no Narrative token or
Segment identities and no time. `CaptionTiming` independently owns one
complete, flat table of absolute unit boundaries on one Timeline. A domain adapter can produce that
timing from speech, SRT/VTT can publish it directly, and authored absolute timing can use the same
renderer. Cue membership belongs to the document; visibility envelopes, handoff, layout and motion
belong to the selected rendering family.

A rendering family's Track accepts `document`, `timing`, `timeline`, the spatial inputs its renderer
actually needs and ordered `Use` children. Fine takes one placement Frame:

```svml
<caption:Hidden id="hidden"/>
<narrative-caption:Timing id="story-captions" document={story.caption}
  binding={story.caption-binding} projection={story-time}/>
<time:Window id="impact-window" timeline={film.timeline} from="12s" for="2s"/>
<caption-fine:Caption id="captions" document={story.caption} timing={story-captions}
  timeline={film.timeline} within={vertical.bounds}>
  <caption-fine:Use style={plain}/>
  <caption-fine:Use role="GUEST" style={guest}/>
  <caption-fine:Use during={demo-window} style={hidden}/>
  <caption-fine:Use during={impact-window} style={impact}/>
</caption-fine:Caption>
```

Each bounded Use consumes one resolved Window through `during`. Omitted time means the Use applies
to the complete Caption document; it is the deliberate batch-caption form, not an anonymous Timeline
Window. Domain adapters must resolve semantic or other domain references to ordinary absolute values
before a Caption family consumes them. `role` filters content independently of time. Later matching
Uses replace earlier presentation inside their windows, including a Hidden Style. Separate Tracks
remain independent and can intentionally display simultaneous captions.

## Rendering-family extension

A family owns its Style, schedule, renderer and Track declaration. It can use ordinary VisualTrack
objects or an explicit HTML visual; no central renderer dispatch is required.

The public helpers and Types are in [index.ts](src/index.ts):

- `CaptionStyleIntent` carries a family identifier and parameters, or `rendering: null` for Hidden.
- `CaptionProgram` is the Track's internal collection of ordered, resolved Uses and referenced Styles.
  It is not a separate author element. `create-caption-uses` and `append-caption-use` assemble it from
  typed Windows. The Track may export it for its Companion, like Visual and Audio Clips.
- `captionUseVisibility(program, index, role, envelope)` intersects a Cue envelope with a Use and
  subtracts later matching windows. Hidden participates even though it renders nothing.
- `CaptionTiming` retains only `timelineId`, `documentId` and complete absolute unit boundaries.
  Narrative-specific binding and projection belong to `@hypit/narrative-caption`.

Derive layout and animation from authored Cue content and original timing. Apply Use coverage as a
visibility mask. Fine keeps the original Present span and element animations, with separate
`visibility` intervals; changing or briefly hiding a Style does not restart karaoke, typing or motion.
A family may define lead/tail, handoff, lines, pages and local states, but it does not split or merge
authored Cues. Its resulting visibility stays inside the winning Use window. Empty content produces
no drawing.

Word attributes remain on `CaptionDocument.words`. A structural family can interpret an explicit
attribute as a keyword role while retaining complete display/alignment units. Time selection does
not split `<display|speech>` text, and elapsed Cue progress is not a replacement for word timing.
The content query helpers for Role and attributes remain here. Narrative Selection-to-unit queries
belong to `@hypit/narrative-caption`; neither defines the Use time language.

See Fine's [declaration compiler](../caption-fine/src/declaration.ts), [schedule](../caption-fine/src/schedule.ts) and
[renderer](../caption-fine/src/render.ts) for a concrete implementation. New family behavior belongs
in its own project package. The selected family interprets its own Styles; mixed-family dispatch,
when useful, is an explicit component responsibility.
