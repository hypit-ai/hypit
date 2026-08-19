# @hypit/whisperx

Explicit WhisperX model-family capability for the official speech program. Importing this package
selects WhisperX; Runtime registration only binds the resulting alignment Need to
a concrete WhisperX execution endpoint such as a trusted local worker or hosted service.

The package contains no credentials, Python environment or queue. Providers translate the typed
request directly into provider-neutral `AlignedTranscriptEvidence`. There is no vendor-shaped
Evidence wrapper or pass-through normalization node in the graph.

The request Producer consumes only canonical `SpeechEvidenceAudio` bytes. `@hypit/media-pipeline`
first requests the explicit 48 kHz stereo speech-master → 16 kHz mono evidence projection. Authored
Segment identity never enters the WhisperX Need or Provider. The later Speech Alignment operation
receives `SpeechAudioBasis` through its own graph edge and assigns acoustic passages to its exact
Segment frame windows there.

`@hypit/provider-whisperx-local` is the first concrete adapter; it validates and stages those bytes
unchanged for a warm loopback service.
