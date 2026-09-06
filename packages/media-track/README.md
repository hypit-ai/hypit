# `@hypit/media-track`

Official provider-free Media Item and Sequence authoring package.

The domain computation consumes explicit ProgramSpace and CanvasSpace. The current Markup `Track`
requires `semantic` and `canvas`; its Fragment projects ProgramSpace from that SemanticTrack, even
when an Item uses clock expressions. Each independently timed `Item` receives an explicit SpatialFrame and either
one direct source or ordered Paint/sample layers. A visual source is always named by its actual
form: `image`, prepared `media`, or compositable `surface`. Moving video must be prepared by an
explicit Media Pipeline `Normalize` Operation before it enters the Track; the Track never guesses a
stream, frame rate or audio policy. `Sequence` owns an ordered replacement surface with explicit
activation points and pairwise Handoffs. Package-owned Recipes cover fitting, source occupancy,
frame Paint, clipping, borders, shadows, lifecycle motion and sampling motion.

Ordinary Items consume projected `TemporalWindow` values. Sequence Member activations and the
Sequence terminal consume projected `TemporalInstant` values instead; the Sequence component owns
only the schedule and handoff consumption that follows those points. All domain Producers receive
ProgramSpace explicitly and do not locate semantic sources themselves.

Visual and audio are separate deterministic projections. A visual-only Track exports only
`VisualTrack`; selecting one source layer's audio or adding explicit enter/exit/handoff sounds also
exports a peer `AudioTrack`. Speech Track reuses the same lowering laws through a deliberately
restricted internal projection.

The package lowers only track composition. It does not add Media, B-roll or Provider meaning to Core,
Film, Composition or HyperFrames. “B-roll” is an editorial use of an ordinary Item or Sequence.

## Author Items and replacement Sequences

These excerpts assume the imports, named assets, normalized media, Frames, Extents, Script,
SemanticTrack and Recipes are already declared:

```svml
<media-track:Track id="coverage" semantic={speech.semantic} canvas={vertical}>
  <media-track:Item image={photo} extent={photo-extent} frame={full-frame}
    during={story.selection.example} appearance={recipes.media.still}/>
  <media-track:Item media={clip-media.media} frame={full-frame}
    during={story.selection.proof} appearance={recipes.media.clip}/>
</media-track:Track>
```

One Item selects exactly one direct source form (`image` + `extent`, prepared `media`, or `surface`)
or declares ordered `Paint`/`Layer` children. The current Surface has no raw `video` attribute.
Appearance owns stack order, fit, clipping and source sampling; a `motion` Recipe owns lifecycle
movement. `Sampling` children can move the sampled content inside the Frame independently.

```svml
<media-track:Track id="cards" semantic={speech.semantic} canvas={vertical}>
  <media-track:Sequence id="steps" frame={card-frame} appearance={recipes.media.card}
    until={story.selection.demo} until-boundary="end">
    <media-track:Member id="one" image={first} extent={card-extent}
      at={story.moment.first}/>
    <media-track:Member id="two" image={second} extent={card-extent}
      at={story.moment.second}/>
    <media-track:Handoff id="one-two" from="one" transition={recipes.transition.cards}/>
  </media-track:Sequence>
</media-track:Track>
```

Members have ordered activation Instants; the next activation ends the preceding logical phase,
and the Sequence has an explicit terminal Instant. Each adjacent pair needs a Handoff, including
an explicit `cut` when no blended transition is intended. `from` names the outgoing Member; its
successor is the incoming Member. A Handoff's duration and boundary ratio place the visual transition
around that logical boundary without moving the semantic event.

An Item or Member can select audio using `source-audio`: `content` for its direct source, or a child
Layer id for layered content. This is opt-in. `Sound` can instead attach normalized audio to Item
`at="enter"` / `at="exit"`, or to a Sequence `handoff="one-two"`. The Track publishes `.visual` and
`.program`, plus `.audio` when sound is present; Film must include the desired peer outputs.

## Item windows and source playback

The Item's projected Window determines when it is active in the program. A timed sample's Recipe
separately controls which source frames it occupies there. `playback` defaults to `once-start`:

| Value | Source occupancy inside the Window |
| --- | --- |
| `once-start` | Play at native rate from the source start. Truncate if the Window is shorter; draw no source after it ends if the Window is longer. |
| `once-end` | Align native playback to the Window end. Use the source tail if the Window is shorter; leave the initial excess unoccupied if longer. |
| `hold-start` | Play from the start, then hold the last source frame over any remaining Window. |
| `hold-end` | Align playback to the end, holding the first source frame over any initial excess. |
| `loop-start` / `loop-end` | Repeat at native rate, aligning the loop phase to the start or end. |
| `stretch` | Retime the selected source range across the full Window. |

`trim-start` and `trim-end` are a pair of integer source-frame boundaries, with an exclusive end.
Omit both to use the full source. The playback rules apply to the trimmed range when present.
For `stretch`, the source-frame advance is `sourceLength / targetLength`. For native playback, moving
media has already been normalized to ProgramSpace's frame rate, so one program frame advances one
source frame. These are source sampling choices; they do not move a Selection's semantic boundaries.

A two-second Item can use the beginning of a four-second generated clip without requesting a
model-invalid two-second generation. Conversely, an Item active longer than its source must choose
whether a return to the layer below, a hold, a loop or retiming is intended. No mode is universally
correct for B-roll. Extending a Window with `once-start` does not extend the underlying video.

Durationless still images refuse `playback`, `trim-start` and `trim-end`. Their spatial placement and
Item Window are sufficient. A static B-roll picture does not need conversion to a generated clip.

Visual and source-audio projections remain separate. Selecting source audio applies the corresponding
sampling policy to that audio; a held visual frame does not synthesize held sound. A silent B-roll
layer can cover a speaking Track while the latter's audio continues unchanged.

For adjacent semantic Items that should have no uncovered pause, author touching Selection boundaries
using Script affinity. Also inspect opacity transitions and source exhaustion: touching Windows alone
do not guarantee opaque visual coverage.
