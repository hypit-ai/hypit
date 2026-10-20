# `@hypit/media-operations`

Provider-neutral media operation vocabulary. Ingestion contributes one ordinary finite Fragment:

```text
Blob
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
speech alignment component may bind one normalized local domain to one authored Segment.

The current normalization profile uses one source presentation origin, a requested rational video frame
rate, and a 48 kHz stereo PCM render stem. It preserves input level: loudness/mastering remains a
separate author policy. Its public `SynchronizedMedia` waist carries only the common frame domain,
optional visual Artifact plus intrinsic extent, and optional audio Artifact. Stream indexes,
authority choice and the trim/pad ledger remain in Selection and execution instead of travelling
through every consumer. The field is named `frameDomain`, not `timeline`, because it describes the
normalized source before any program placement.

Normalization preserves transparency in the selected visual stream. The executing Provider owns
the intermediate encoding; both opaque and transparent pictures use the same SynchronizedMedia
value. Normalization also publishes the media's neutral local temporal domain. Speech alignment may
describe Narrative boundaries on that domain; Timeline authoring may consume its Extent; a domain
projector may map its boundaries through an equal-length Window. None of those relationships is embedded
back into SynchronizedMedia.

This package is the shared execution vocabulary. Speech authoring makes the boundary explicit:
`<mediaop:Normalize>` produces `SynchronizedMedia + LocalTemporalDomain`; a speech provider and
deterministic alignment produce `NarrativeAlignment`; Timeline authoring separately produces absolute
Windows. Visual and Audio Tracks consume ordinary media plus the explicit Windows and sampling choices
they declare; neither owns an implicit normalization policy.

The frame clock is a separate program fact and can be shared by every Normalize and Timeline assembly:

```svml
<time:Clock id="clock" frame-rate="30"/>
<mediaop:Normalize id="shot-media" source={shot.video}
  recipe={recipes.media.aroll} clock={clock}/>
```

An SVS recipe may centralize the stream policy (`video`, `audio` and `span-authority`); it does not
hide the Normalize graph node or turn multiple sources into one opaque batch operation.

A still image becomes ordinary video before it enters that waist:

```svml
<mediaop:StillVideo id="opening-still" source={opening-head.image}
  duration="6s" clock={clock}/>
<mediaop:Normalize id="opening-media" source={opening-still.video}
  video="primary-moving" audio="none" span-authority="video" clock={clock}/>
```

Several images spread over one literal duration the same way, each held for its share of the frames:

```svml
<mediaop:StillVideo id="kitchen-stills" duration="6s" clock={clock}>
  <mediaop:Still source={counter.image}/>
  <mediaop:Still source={basil.image} weight="2"/>
  <mediaop:Still source={board.image}/>
</mediaop:StillVideo>
```

`StillVideo` returns a video-only MP4 `Blob`, not `SynchronizedMedia`. Its duration is an exact
`TemporalDuration`; it must land on a positive whole frame count for the selected Clock and is never
rounded. The Surface publishes that duration and the weights as Records; `plan-still-video` divides the whole frame count among the
pictures (every picture holds at least one frame, the rest go by weight with leftovers to the largest
remainders, earlier first), `bind-still-video-source` attaches each picture in authored order, and
encoding is one `render-still-video` Need. Pictures of different sizes are fitted into the first one's
frame and letterboxed. Inspection and normalization remain the same explicit steps used by imported
or generated moving video. The resulting Blob is ordinary time-bearing visual media. Its later role
comes entirely from the downstream Source relationships; StillVideo itself owns only the authored
images, duration and frame clock.

The package also exposes the one-picture Run Fragment `still-video`. It takes `duration`, `clock`,
`layout` and `source-0`. A Run can select its `video` export as a Candidate through `satisfy`.

Four ordinary author operations reuse that same inspection/execution boundary:

```xml
<mediaop:Normalize id="shot-media" source={shot.video}
  video="primary-moving" audio="default" span-authority="video" clock={clock}/>
<mediaop:Transform id="prepared" source={shot-media.media}>
  <mediaop:Trim tail="0.25s"/>
  <mediaop:Retime rate="1.05"/>
</mediaop:Transform>

<mediaop:ExtractAudio id="voice-reference" source={prepared.video} audio="default"/>
<mediaop:ExtractFrame id="continuity" source={prepared.video} video="primary-moving" at="last"/>
```

Every result is an ordinary `Blob`. Audio extraction emits a deterministic 48 kHz stereo PCM
WAV but makes no NarrativeAlignment, speaker or semantic claim; it can therefore feed a later model
reference port directly. Frame extraction supports `first`, `last`, `frame:<index>` and
`time:<seconds>`. Transform operations are ordered author meaning and never an arbitrary FFmpeg string.

The same package also owns two provider-neutral media completion paths/capabilities:

```text
Composition -> pure AudioProgram -> render-timeline-audio Need -> TimelineAudio
TimelineVisual + TimelineAudio -> mux-program-media Need -> MuxedMedia
```

Compiling an `AudioProgram` is ordinary deterministic code. Reading Artifact bytes, decoding,
resampling, mixing, encoding or muxing is never a Producer shortcut: it is an explicit Provider
Need. The program fixes exact 48 kHz sample boundaries, source-time-derived piece rates, gain/fades and the absence
of hidden normalization/limiting. The local FFmpeg Provider consumes the shared execution body. Other Providers implement the same
public request and result semantics.

AudioProgram preserves AudioClip `gainEnvelope` and `audibility` on the full program sample
clock. The [Composition definition](../composition/README.md#audio-level-automation-on-the-program-clock)
owns their semantics; the program does not reinterpret source choice or presentation precedence.
