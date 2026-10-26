# `@hypit/media-operations`

Provider-neutral media preparation and execution vocabulary. Preparation contributes one ordinary
finite Fragment:

```text
Blob -> inspect-media Need -> MediaInspection
     -> deterministic MediaStreamSelection
     -> pure preparation
     -> PreparedMedia + exact LocalTemporalDomain + TemporalExtent
```

`MediaInspection` enumerates every container stream. The default moving-video policy excludes
`attached_pic` streams, prefers one declared default, accepts one unambiguous remaining candidate,
and otherwise fails closed. An explicit stream index is available when the author genuinely knows
which alternate stream is intended.

`PreparedMedia` retains the original Blob, selected members, exact local domain, display/audio
interpretation and maps back to source presentation time. It chooses no Film frame rate and contains
no execution representation. Selecting embedded audio remains a media fact only; Script meaning and program
placement stay downstream.

```svml
<time:Clock id="clock" frame-rate="30"/>
<mediaop:Prepare id="shot-media" source={shot.video}
  recipe={recipes.media.aroll}/>
```

Visual and Audio Tracks consume that prepared value with explicit Windows and sampling relations.
Visual lowering keeps the exact selected stream and composed `TemporalMap` in the terminal visual program; audio lowering
projects the selected audio source plus its preparation and occurrence maps before the terminal Audio Track enters Composition.
`AudioProgram` then resolves only those audio facts. The selected renderer evaluates them with its
own decoder and working formats. An SVS recipe may centralize stream selection without hiding the Prepare node.

A still image becomes ordinary video before it enters that waist:

```svml
<mediaop:StillVideo id="opening-still" source={opening-head.image}
  duration="6s" clock={clock}/>
<mediaop:Prepare id="opening-media" source={opening-still.video}
  video="primary-moving" audio="none" span-authority="video"/>
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
rounded. The Surface publishes that duration and the weights as Records; `plan-still-video` divides the whole frame count among the
pictures (every picture holds at least one frame, the rest go by weight with leftovers to the largest
remainders, earlier first), `bind-still-video-source` attaches each picture in authored order, and
encoding is one `render-still-video` Need. Pictures of different sizes are fitted into the first one's
frame and letterboxed. Inspection and preparation remain the same explicit steps used by imported
or generated moving video. The resulting Blob is ordinary time-bearing visual media. Its later role
comes entirely from the downstream Source relationships; StillVideo itself owns only the authored
images, duration and frame clock.

The package also exposes the one-picture Run Fragment `still-video`. It takes `duration`, `clock`,
`layout` and `source-0`. A Run can select its `video` export as a Candidate through `satisfy`.

Preparation and pure transformation use the same source-preserving boundary:

```xml
<mediaop:Prepare id="shot-media" source={shot.video}
  video="primary-moving" audio="default" span-authority="video"/>
<mediaop:Transform id="prepared" source={shot-media.media}>
  <mediaop:Trim tail="0.25s"/>
  <mediaop:Retime rate="1.05"/>
</mediaop:Transform>

<mediaop:ExtractAudio id="voice-reference" source={shot.video} audio="default"/>
<mediaop:ExtractFrame id="continuity" source={shot.video} video="primary-moving" at="last"/>
```

Transform returns another `PreparedMedia`. Ordered trim and positive rational retime compose exact
temporal maps without decoding or encoding. Audio/frame extraction remain explicit Blob operations
over a source Blob. Audio extraction emits a deterministic 48 kHz stereo PCM
WAV but makes no NarrativeAlignment, speaker or semantic claim; it can therefore feed a later model
reference port directly. Frame extraction supports `first`, `last`, `frame:<index>` and
`time:<seconds>`. Transform operations are ordered author meaning and never an arbitrary FFmpeg string.

The same package also owns two provider-neutral media completion paths/capabilities:

```text
Composition -> pure AudioProgram -> render-timeline-audio Need -> TimelineAudio
TimelineVisual + TimelineAudio -> mux-program-media Need -> MuxedMedia
```

The mux request also receives the author-owned `MediaDeliverySpec`. It requires the visual
result to carry the matching `VisualDeliverySpec` and the PCM result to match the requested
sample rate and channel layout before asking a Provider to mux. The Provider may stream-copy
the compatible visual stream; it must not use mux as an implicit correction or second render.

Compiling an `AudioProgram` is ordinary deterministic code. Reading Artifact bytes, decoding,
resampling, mixing, encoding or muxing is never a Producer shortcut: it is an explicit Provider
Need. The program is the terminal boundary that resolves exact placement, temporal sampling and fades
onto 48 kHz samples; it also fixes gain and the absence
of hidden normalization/limiting. The local FFmpeg Provider consumes the shared execution body. Other Providers implement the same
public request and result semantics.

AudioProgram preserves AudioClip `gainEnvelope` and `audibility` on the full program sample
clock. The [Composition definition](../composition/README.md#audio-level-automation-on-the-program-clock)
owns their semantics; the program does not reinterpret source choice or presentation precedence.
