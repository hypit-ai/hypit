# `@hypit/media-pipeline`

Provider-neutral media execution vocabulary. Ingestion contributes one ordinary finite Fragment:

```text
BlobArtifact
  -> inspect-media Need
  -> MediaInspection
  -> deterministic stream selection
  -> MediaStreamSelection
  -> normalize-media Need
  -> SynchronizedMedia
```

`MediaInspection` enumerates every container stream. The default moving-video policy excludes
`attached_pic` streams, prefers one declared default, accepts one unambiguous remaining candidate,
and otherwise fails closed. An explicit stream index is available when the author module genuinely
knows which alternate stream it wants.

Selecting embedded audio is a media fact only. This package never assigns Script meaning. A later
speech alignment component binds one normalized Take to one authored Segment.

The current normalization profile uses one source presentation origin, a requested rational video frame
rate, and a 48 kHz stereo PCM render stem. It preserves input level: loudness/mastering remains a
separate author policy. Its public `SynchronizedMedia` waist carries only the common frame domain,
optional visual Artifact plus intrinsic extent, and optional audio Artifact. Stream indexes,
authority choice and the trim/pad ledger remain in Selection and execution instead of travelling
through every consumer.

Normalization preserves transparency in the selected visual stream. The executing Provider owns
the intermediate encoding; both opaque and transparent pictures use the same SynchronizedMedia
value. A later SemanticTake adds Script timing while retaining that prepared media. A visual
overlay can instead enter Media Track directly.

This package is the shared execution vocabulary. Speech authoring makes the boundary explicit:
`<pipeline:Normalize>` produces one `SynchronizedMedia`, then a speech provider and deterministic
alignment produce one `SemanticTake`. Media Track consumes that prepared value; it never owns an
implicit visual-only normalization policy.

The frame clock is a separate program fact and can be shared by every Normalize and Speech Track:

```svml
<program:Clock id="clock" frame-rate="30"/>
<pipeline:Normalize id="shot-media" source={shot.video}
  recipe={recipes.media.aroll} clock={clock}/>
```

An SVS recipe may centralize the stream policy (`video`, `audio` and `span-authority`); it does not
hide the Normalize graph node or turn multiple sources into one opaque batch operation.

A still image becomes ordinary video before it enters that waist:

```svml
<media:StillVideo id="opening-still" source={opening-head.image}
  duration="6" clock={clock}/>
<pipeline:Normalize id="opening-media" source={opening-still.video}
  video="primary-moving" audio="none" span-authority="video" clock={clock}/>
```

Several images spread over one literal duration the same way, each held for its share of the frames:

```svml
<media:StillVideo id="kitchen-stills" duration="6" clock={clock}>
  <media:Still source={counter.image}/>
  <media:Still source={basil.image} weight="2"/>
  <media:Still source={board.image}/>
</media:StillVideo>
```

For a short-lived diagnostic clip, `guide="clip-time"` burns one coherent band containing the
clip-local timecode, current frame and progress ruler. Omit it for clean production pixels. The
guide says nothing about the clip's eventual position in a Film.

`StillVideo` returns a video-only MP4 `BlobArtifact`, not `SynchronizedMedia`. The Surface publishes the
duration and the weights as Records; `plan-still-video` divides the whole frame count among the
pictures (every picture holds at least one frame, the rest go by weight with leftovers to the largest
remainders, earlier first), `bind-still-video-source` attaches each picture in authored order, and
encoding is one `render-still-video` Need. Pictures of different sizes are fitted into the first one's
frame and letterboxed. Inspection and normalization remain the same explicit steps used by imported
or generated moving video. The resulting Blob can carry a wordless Segment's media span, supply
provisional visual media for estimated semantic timing, or satisfy a downstream input that expressly
needs a video Artifact. Spoken performance and independent narration obtain their measured semantic
time from their own A-roll media, not from this held picture.

The package also exposes one-picture Run Fragments. `still-video` takes `duration`, `clock`,
`layout` and `source-0`; `clip-time-still-video` takes `duration`, `clock` and `source`, supplying
the diagnostic layout itself. A Run can select either ordinary branch as a Candidate through an
explicit `candidate` / `satisfy` decision.

Four ordinary author operations reuse that same inspection/execution boundary:

```xml
<pipeline:Normalize id="shot-media" source={shot.video}
  video="primary-moving" audio="default" span-authority="video" clock={clock}/>
<media:Transform id="prepared" source={shot-media.media}>
  <media:Trim tail="0.25s"/>
  <media:Retime rate="1.05" pitch="preserve"/>
</media:Transform>

<media:ExtractAudio id="voice-reference" source={prepared.video} audio="default"/>
<media:ExtractFrame id="continuity" source={prepared.video} video="primary-moving" at="last"/>
```

Every result is an ordinary `BlobArtifact`. Audio extraction emits a deterministic 48 kHz stereo PCM
WAV but makes no `SemanticTake`, speaker or alignment claim; it can therefore feed a later model
reference port directly. Frame extraction supports `first`, `last`, `frame:<index>` and
`time:<seconds>`. Transform operations are ordered author meaning and never an arbitrary FFmpeg string.

The same package also owns two provider-neutral media completion plans/capabilities:

```text
Composition -> pure AudioProgramPlan -> render-timeline-audio Need -> TimelineAudio
RenderedVisual + TimelineAudio -> mux-program-media Need -> MuxedMedia
```

Compiling an `AudioProgramPlan` is ordinary deterministic code. Reading Artifact bytes, decoding,
resampling, mixing, encoding or muxing is never a Producer shortcut: it is an explicit Provider
Need. The plan fixes exact 48 kHz sample boundaries, gain/fade/playback parameters and the absence
of hidden normalization/limiting. The local FFmpeg and AWS Lambda Providers consume the same shared
execution body and return the same public contracts.
