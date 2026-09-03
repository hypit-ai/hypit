# @hypit/whisperx

Explicit WhisperX model-family capability for the official speech program. Importing this package
selects WhisperX; Runtime registration only binds the resulting alignment Need to a concrete
execution endpoint. The default Hypit Skill path uses the HypiHub-hosted WhisperX endpoint; the
trusted local worker remains an explicit fallback.

The package contains no credentials, Python environment or queue. Providers translate the typed
request directly into provider-neutral `AlignedTranscriptEvidence`. There is no vendor-shaped
Evidence wrapper or pass-through normalization node in the graph.

`<whisperx:SemanticTake>` consumes one normalized `SynchronizedMedia`, exactly one Script Segment,
and a required `language="en"` or `language="zh"`. The language is passed directly to WhisperX;
Script text and audio are never inspected to choose it implicitly. `@hypit/media-pipeline` projects
that Take's 48 kHz audio to canonical 16 kHz mono
`SpeechEvidenceAudio`; WhisperX sees only those bytes. A deterministic local alignment then combines
the returned evidence with the one Segment and emits one self-contained `SemanticTake`.

There is no whole-program WhisperX pass. Speech Track only receives already-semantic Takes and later
translates their local frames when assembling the final ProgramSpace and complete semantic map.

`@hypit/provider-hypihub` is the default concrete adapter; it uploads the canonical evidence audio
and requests verbose JSON with segment- and word-level timestamps. `@hypit/provider-whisperx-local`
remains available as an explicit local fallback.
