# `@svml/whisperx`

Deterministic timing locator for the result of one ordinary WhisperX run. The package does not
invoke Python, read audio, rerun forced alignment against Script, use an LLM, infer speakers or
retain multiple candidate paths. A Host adapter preserves the raw WhisperX artifact and supplies
the normalized word, character, score, VAD and Segment fields used here.

The locator aligns each known Script Segment independently. A bounded monotonic M:N dynamic
program accepts exact, split, merge, replacement, source-omission and evidence-insertion groups.
Within a selected group, timed WhisperX characters determine Script token boundaries; word times,
VAD bounds and deterministic zero-width estimates are fallbacks in that order. The result contains
one timing for every Script token and all `2M + 2N` semantic anchors.

Dual Text is not located a second time. `deriveCaptionAtomTiming()` composes the speech map with
the authored `CaptionAtom -> speech token range` projection. The complete display atom inherits
the speech envelope; this package never invents linear timings for words inside its display side.
