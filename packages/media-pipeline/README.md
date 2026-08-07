# `@svml/media-pipeline`

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
separate author policy.

The same package also owns two provider-neutral finalization plans/capabilities:

```text
Composition -> pure AudioProgramPlan -> render-timeline-audio Need -> TimelineAudio
RenderedVisual + TimelineAudio -> mux-program-media Need -> MuxedMedia
```

Compiling an `AudioProgramPlan` is ordinary deterministic code. Reading Artifact bytes, decoding,
resampling, mixing, encoding or muxing is never a Producer shortcut: it is an explicit Provider
Need. The plan fixes exact 48 kHz sample boundaries, gain/fade/playback parameters and the absence
of hidden normalization/limiting. A local FFmpeg Provider and a future Lambda Provider must consume
the same plan and return the same public contracts.
