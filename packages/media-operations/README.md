# `@hypit/media-operations`

Provider-neutral materialization and extraction operations. Markup supplies the public `StillVideo`,
`ExtractAudio` and `ExtractFrame` spellings; the same operations can be constructed through another
author frontend without changing their media semantics.

Resource inspection, stream selection and PreparedMedia construction are owned by `@hypit/media` itself:

```text
Blob -> inspect-media Need -> MediaInspection
     -> deterministic MediaStreamSelection
     -> pure preparation
     -> PreparedMedia + exact LocalTemporalDomain + TemporalExtent
```

`Video` and `Audio` are Media author objects with a direct Resource branch and lazy prepared branch.
`MediaInspection` enumerates every container stream. Default selection excludes `attached_pic` streams,
prefers one declared default, accepts one unambiguous remaining candidate, and otherwise fails closed.
An explicit stream index remains available on the Media declaration.

`PreparedMedia` retains the original Blob, selected members, exact local domain, visual interpretation
and maps back to source presentation time. Audio decoder shape is not copied beyond inspection because no Programme consumer uses it.
It chooses no Film frame rate and contains
no execution representation. Selecting embedded audio remains a media fact only; Script meaning and program
placement stay downstream.

```svml
<media:Video id="shot" source={generation.video} audio="default"/>
```

Visual and Audio Tracks consume that prepared value with explicit Windows and sampling relations.
Visual lowering keeps the exact selected stream and composed `TemporalMap` in the terminal visual program; audio lowering
projects the selected audio source plus its preparation and occurrence maps before the terminal Audio Track enters Composition.
`@hypit/audio-program` then projects absolute programme boundaries onto its sample grid while retaining
both maps. The selected renderer evaluates them with its own decoder and working formats. Media preparation
is not a top-level `@hypit/media-operations` declaration and does not materialize a normalized file.

A still image becomes ordinary video before it enters that waist:

```svml
<mediaop:StillVideo id="opening-still" source={opening-head.image}
  duration="6s" clock={clock}/>
<media:Video id="opening-media" source={opening-still.video}
   audio="none" />
```

Several images spread over one literal duration the same way, each held for its share of the frames:

```svml
<mediaop:StillVideo id="kitchen-stills" duration="6s" clock={clock}>
  <mediaop:Still source={counter.image}/>
  <mediaop:Still source={basil.image} weight="2"/>
  <mediaop:Still source={board.image}/>
</mediaop:StillVideo>
```

`StillVideo` returns a video-only MP4 `Blob`, not `PreparedMedia`. Its duration is an exact
`TemporalDuration`; it must land on a positive whole frame count for the selected Clock and is never
rounded. The declaration publishes that duration and the weights as Records; `plan-still-video` divides the whole frame count among the
pictures (every picture holds at least one frame, the rest go by weight with leftovers to the largest
remainders, earlier first), `bind-still-video-source` attaches each picture in authored order, and
encoding is one `render-still-video` Need. Pictures of different sizes are fitted into the first one's
frame and letterboxed. Inspection and preparation remain the same explicit steps used by imported
or generated moving video. The resulting Blob is ordinary time-bearing visual media. Its later role
comes entirely from the downstream Source relationships; StillVideo itself owns only the authored
images, duration and frame clock.

Audio and frame extraction are explicit Blob operations:

```xml
<mediaop:ExtractAudio id="voice-reference" source={shot.video} audio="default"/>
<mediaop:ExtractFrame id="continuity" source={shot.video} video="primary-moving" at="last"/>
```

Audio extraction emits a deterministic 48 kHz stereo PCM
WAV but makes no NarrativeAlignment, speaker or semantic claim; it can therefore feed a later model
reference port directly. Frame extraction supports `first`, `last`, `frame:<index>` and
`time:<seconds>`.

This package deliberately has no `PreparedMedia -> PreparedMedia` Transform. Trim, retime, reverse,
loop, hold and curve operations belong to one Film/NLE occurrence and resolve there into its
target-to-source `TemporalMap`. Repeating the same edit repeats the occurrence relation. A reusable
materialized result is produced outside SVML and re-enters as a new Blob/Media; an editor gesture does
not create a second media identity.

The terminal audio Programme and final audiovisual delivery are deliberately not operations on
prepared material. `@hypit/audio-program` owns Composition-to-sample-plan lowering and its renderer
capability; `@hypit/media-delivery` owns compatibility checking and mux assembly. A physical Provider
may implement all three packages' capabilities without merging their public ownership.
