# @narratage/whisperx

Explicit WhisperX model-family capability for the official speech program. Importing this package
selects WhisperX; Runtime registration only binds the resulting `WhisperXAlignmentEvidence` Need to
a concrete WhisperX execution endpoint such as a trusted local worker or Hypit.

The package contains no credentials, Python environment or queue. Providers translate the typed
request constraints and return the canonical WhisperX result contract. A deterministic Producer
then lowers that result to provider-neutral `AlignedTranscriptEvidence`.

The request Producer consumes only canonical `SpeechEvidenceAudio`, never the visual SpeechBasis
projection and never an arbitrary container audio stream. `@narratage/media-pipeline` first requests the
explicit 48 kHz stereo speech-master → 16 kHz mono evidence projection. That Record binds the
zero-origin rational sample map and exact evidence bytes. The Producer Derivation binds the source
SpeechAudioBasis; the Need and Receipt bind the exact evidence-audio request to the accepted result.

`@narratage/provider-whisperx-local` is the first concrete adapter; it validates and stages those bytes
unchanged for a warm loopback sidecar.
