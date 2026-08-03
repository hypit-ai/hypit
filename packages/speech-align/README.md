# `@svml/speech-align`

Provider-neutral deterministic timing locator for one aligned transcript. The package does not
invoke Python, read audio, call a speech provider, use an LLM, infer speakers or retain multiple
candidate paths. A runtime adapter preserves its raw provider artifact and supplies the normalized
word, character, score, speech-activity and Segment evidence used here.

The locator aligns each known Script Segment independently. A bounded monotonic M:N dynamic
program accepts exact, split, merge, replacement, source-omission and evidence-insertion groups.
Within a selected group, timed evidence characters determine Script token boundaries; word times,
speech-activity bounds and deterministic zero-width estimates are fallbacks in that order. The result contains
one timing for every Script token and all `2M + 2N` semantic anchors.

Caption display is outside this package. `@svml/caption` composes the resulting complete speech
map with Script's authored Caption Projection and keeps presentation estimates local to the track.
