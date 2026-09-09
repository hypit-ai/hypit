# `@hypit/audio-track`

The Track Surface accepts `semantic={speech.semantic}` or `space={animation}`. Semantic context
resolves Script Selections and Moments; authored space supports clock-based animation. Shared `at`
inputs accept a Moment or a time such as `2s`; `at` with `for` produces a Window where required.

Place music, ambience and sound effects in the assembled video. A reveal sound can follow a Script
Moment; music can occupy a Segment or the program; an explicitly timed sound can use clock placement.
Performance audio normally comes from [Speech Track](../speech-track/README.md) and can continue
under these independent sounds and [Media Track](../media-track/README.md) coverage.

Each Clip consumes normalized audio-bearing media and a projected Window. Gain, fades, trim and
playback express the mix. Normalization preserves the source level; choose the balance and any
music ducking for the actual performance. The resulting `.track` is a peer AudioTrack in Film.

## Authoring clips

The Markup Track selects `semantic` or `space`; its Fragment receives the resulting ProgramSpace.
Each Clip accepts one shared temporal Window form: `during="program"`, a Selection or Segment,
a Moment paired with `for`, or explicit `start`/`end` expressions. The source must already contain
normalized audio. This excerpt assumes imports, Script, SemanticTrack, Clock and source media exist:

```svml
<pipeline:Normalize id="hit-media" source={hit-source}
  video="none" audio="default" span-authority="audio" clock={clock}/>
<audio:Track id="effects" semantic={speech.semantic}>
  <audio:Clip source={hit-media.media} at={story.moment.reveal} for="600ms"
    playback="once" gain="0.45" fade-in="0f" fade-out="3f"/>
</audio:Track>
```

The Track publishes `.program` and `.track`; include the latter as a peer Film Track. `gain` is a
linear multiplier, defaulting to `1`; fade durations default to `0f`. Trim boundaries are source
durations (`f`, integer `ms`, or fractional `s`), distinct from the Clip's destination Window.
`trim-end` is the exclusive source endpoint, not an amount to subtract from the tail. For example,
`trim-start="1s" trim-end="3s"` selects the source interval from one to three seconds.

`once` / `once-start` plays once from the Window start; `once-end` aligns to its end. `loop` /
`loop-start` and `loop-end` repeat with the corresponding alignment. `stretch` preserves pitch and
requires authored `min-rate` and `max-rate` bounds. Other playback modes reject those rate bounds.
Choose occupancy from the intended sound; the Track does not silently loop music or stretch a hit
to fill a longer Window. Its source level is retained unless gain or another explicit audio operation
changes it.
