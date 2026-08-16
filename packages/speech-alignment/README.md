# `@narratage/speech-alignment`

Provider-neutral deterministic timing locator for one aligned transcript. The package does not
invoke Python, read audio, call a speech provider, use an LLM, infer speakers or retain multiple
candidate paths. A runtime adapter preserves its raw provider artifact and supplies the normalized
word, character, score and speech-activity evidence used here in exact 16 kHz sample coordinates.

Using the explicitly connected SpeechAudioBasis, the locator first projects exact Segment frame
cuts into the same evidence-sample domain and assigns acoustic passages there. It then aligns each
known Script Segment independently. A bounded monotonic M:N dynamic
program accepts exact, split, merge, replacement, source-omission and evidence-insertion groups.
Within a selected group, timed evidence characters determine Script token boundaries; word times
and speech-activity bounds are fallbacks. Missing token runs receive continuous weighted windows
between their measured neighbors instead of invented point timestamps. The result is quantized once
into the selected ProgramSpace and contains one timing for every Script token and all `2M + 2N`
semantic anchors. Segment anchors copy the Basis frame cuts directly; they never round-trip through
floating-point seconds.

The locator accepts Narrative, SpeechAudioBasis and AlignedTranscriptEvidence through three explicit
graph edges. Evidence carries no authored Segment identity; the locator checks its sample windows
against the supplied Basis and performs that association locally.
Artifact and Basis relationships stay in explicit upstream graph edges instead of being copied
through every evidence value.

`speechAlignmentComponent` exposes the locator as one enumerable deterministic Producer facet. Its
identity is checked against `speechAlignmentManifest` and executes through the host-neutral compute
port. The package depends only on public video
contracts and protocol utilities; it has no Core, Driver, Provider, Artifact, queue or credential
authority.

Caption display is outside this package. `@narratage/caption` composes the resulting complete speech
map with Script's explicit whole-Atom `CaptionCorrespondence`; it never asks this locator to infer
display text or display-Word timing.
