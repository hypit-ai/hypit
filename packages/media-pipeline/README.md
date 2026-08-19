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

Selecting embedded audio is a media fact only. This package never produces `SpeechBasis` or
`SpeechAudioBasis`; a speech component must separately bind normalized audio to a Narrative and its
Segment identities.

The current normalization profile uses one source presentation origin, a requested rational video frame
rate, and a 48 kHz stereo PCM render stem. It preserves input level: loudness/mastering remains a
separate author policy. Its public `SynchronizedMedia` waist carries only the common frame domain,
optional visual Artifact plus intrinsic extent, and optional audio Artifact. Stream indexes,
authority choice and the trim/pad ledger remain in Selection and execution instead of travelling
through every consumer.

This package is the shared execution vocabulary, not mandatory authoring boilerplate. A consuming
Surface that already owns the needed policy may expand the same finite graph itself. For example,
`speech:Take video={take.video}` selects default A/V at the Spine's explicit frame rate, while
`media-track:Item video={shot.video}` selects visual-only media at the connected ProgramSpace rate.
Their lower-level `media=` inputs remain available for an explicitly prepared `SynchronizedMedia`.
Core and Providers see the same Operations in both forms.

Three ordinary author operations reuse that same inspection/execution boundary:

```xml
<media:Transform id="prepared" source={shot.video}
  video="primary-moving" audio="default" span-authority="video" frame-rate="30">
  <media:Trim tail="0.25s"/>
  <media:Retime rate="1.05" pitch="preserve"/>
</media:Transform>

<media:ExtractAudio id="voice-reference" source={prepared.video} audio="default"/>
<media:ExtractFrame id="continuity" source={prepared.video} video="primary-moving" at="last"/>
```

Every result is an ordinary `BlobArtifact`. Audio extraction emits a deterministic 48 kHz stereo PCM
WAV but makes no `SpeechBasis`, speaker or alignment claim; it can therefore feed a later model
reference port directly. Frame extraction supports `first`, `last`, `frame:<index>` and
`time:<seconds>`. Transform operations are ordered author meaning and never an arbitrary FFmpeg string.

The same package also owns two provider-neutral finalization plans/capabilities:

```text
Composition -> pure AudioProgramPlan -> render-timeline-audio Need -> TimelineAudio
RenderedVisual + TimelineAudio -> mux-program-media Need -> MuxedMedia
```

Compiling an `AudioProgramPlan` is ordinary deterministic code. Reading Artifact bytes, decoding,
resampling, mixing, encoding or muxing is never a Producer shortcut: it is an explicit Provider
Need. The plan fixes exact 48 kHz sample boundaries, gain/fade/playback parameters and the absence
of hidden normalization/limiting. The local FFmpeg and AWS Lambda Providers consume the same shared
execution body and return the same public contracts.
