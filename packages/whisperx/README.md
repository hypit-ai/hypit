# @svml/whisperx

Explicit WhisperX model-family capability for the official speech program. Importing this package
selects WhisperX; Runtime registration only binds the resulting `WhisperXAlignmentEvidence` Need to
a concrete WhisperX execution endpoint such as a trusted local worker or Hypit.

The package contains no credentials, Python environment or queue. Providers translate the typed
request constraints and return the canonical WhisperX result contract. A deterministic Producer
then lowers that result to provider-neutral `AlignedTranscriptEvidence`.

The request Producer consumes only canonical `SpeechEvidenceAudio`, never the visual SpeechTake
projection and never an arbitrary container audio stream. `@svml/media-pipeline` first requests the
explicit 48 kHz stereo speech-master → 16 kHz mono evidence projection. That Record binds the
original Artifact, zero-origin rational sample map, resampler implementation and exact evidence
bytes.

Producer result affinity requires returned Basis, original audio Artifact, evidence-audio identity
and ProgramSpace digests to match that exact input before the Evidence can enter BuildState.
`@svml/provider-whisperx-local` is the first concrete adapter; it validates and stages those bytes
unchanged for a warm loopback sidecar.
