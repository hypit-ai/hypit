# @narratage/whisperx

Explicit WhisperX model-family capability for the official speech program. Importing this package
selects WhisperX; Runtime registration only binds the resulting alignment Need to
a concrete WhisperX execution endpoint such as a trusted local worker or hosted service.

The package contains no credentials, Python environment or queue. Providers translate the typed
request constraints directly into provider-neutral `AlignedTranscriptEvidence`. There is no
vendor-shaped Evidence wrapper or pass-through normalization node in the graph.

The request Producer consumes canonical `SpeechEvidenceAudio` bytes plus a separate
`SpeechAudioBasis` edge. `@narratage/media-pipeline` first requests the explicit 48 kHz stereo
speech-master → 16 kHz mono evidence projection. The evidence Record carries only the normalized
Artifact and exact sample count; Segment truth comes from the Basis edge instead of being copied
through an intermediate media value. The Derivation and Need bind all three steps.

`@narratage/provider-whisperx-local` is the first concrete adapter; it validates and stages those bytes
unchanged for a warm loopback service.
