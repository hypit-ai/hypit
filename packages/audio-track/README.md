# `@hypit/audio-track`

Official provider-free Audio Track authoring package.

It consumes explicitly selected and normalized `SynchronizedMedia`, resolves Program, Selection or
Moment windows through `@hypit/temporal`, applies exact source trim and one-shot, loop or bounded
pitch-preserving stretch occupancy, and lowers independent items to one ordinary peer `AudioTrack`.

The public audio waist uses one exact 48 kHz sample mapping. It contains no Provider, queue, path,
Narrative identity, privileged speech lane, automatic extraction, loudness normalization or hidden
mixing behavior. Local and remote media Endpoints execute the same `AudioProgramPlan`.

## Authoring clips

The current Markup Track requires `semantic`; its Fragment derives ProgramSpace from that input.
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
