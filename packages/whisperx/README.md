# @hypit/whisperx

Explicit WhisperX model-family capability for the official speech program. Importing this package
selects WhisperX; Runtime registration only binds the resulting alignment Need to a concrete
execution endpoint. The default Hypit Skill path uses the HypiHub-hosted WhisperX endpoint; the
trusted local worker remains an explicit fallback.

The package contains no credentials, Python environment or queue. Providers translate the typed
request directly into provider-neutral `AlignedTranscriptEvidence`. There is no vendor-shaped
Evidence wrapper or pass-through normalization node in the graph.

`<whisperx:SemanticTake>` is the real-media semantic Surface. It consumes one normalized
`SynchronizedMedia` and exactly one Script Segment. When that Segment contains Tokens, it also
requires `language="en"`, `language="zh"` or `language="es"`. The language is passed directly to
WhisperX; Script text and audio are not used to choose it implicitly. `@hypit/media-pipeline`
projects the Take's audio to canonical 16 kHz mono `SpeechEvidenceAudio`; WhisperX sees only those
bytes. A deterministic local alignment then combines the returned evidence with the Segment and
emits one self-contained `SemanticTake`.

When the authored Segment has no Tokens, write the same Surface without `language`. Its start and
end Anchors map directly to the prepared media's first and final frame. There are no words to align,
so this branch requests no evidence audio and no WhisperX capability:

```svml
<whisperx:SemanticTake id="pause" narrative={story}
  segment={story.segment.pause} media={pause-media.media}/>
```

There is no whole-program WhisperX pass. Speech Track only receives already-semantic Takes and later
translates their local frames when assembling the final ProgramSpace and complete semantic map.

`@hypit/provider-hypihub` is the default concrete adapter; it uploads the canonical evidence audio
and requests verbose JSON with segment- and word-level timestamps. `@hypit/provider-whisperx-local`
remains available as an explicit local fallback.
