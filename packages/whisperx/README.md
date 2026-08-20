# @hypit/whisperx

Explicit WhisperX model-family capability for the official speech program. Importing this package
selects WhisperX; Runtime registration only binds the resulting alignment Need to
a concrete WhisperX execution endpoint such as a trusted local worker or hosted service.

The package contains no credentials, Python environment or queue. Providers translate the typed
request directly into provider-neutral `AlignedTranscriptEvidence`. There is no vendor-shaped
Evidence wrapper or pass-through normalization node in the graph.

`<whisperx:SemanticTake>` consumes one normalized `SynchronizedMedia` and exactly one Script
Segment. `@hypit/media-pipeline` projects that Take's 48 kHz audio to canonical 16 kHz mono
`SpeechEvidenceAudio`; WhisperX sees only those bytes. A deterministic local alignment then combines
the returned evidence with the one Segment and emits one self-contained `SemanticTake`.

There is no whole-program WhisperX pass. Speech Spine only receives already-semantic Takes and later
translates their local frames when assembling the final ProgramSpace and complete semantic map.

`@hypit/provider-whisperx-local` is the first concrete adapter; it validates and stages those bytes
unchanged for a warm loopback service.
