# `@hypit/speech-alignment`

Provider-neutral deterministic timing locator for one normalized Segment Take. The package does not
invoke Python, read audio, call a speech provider, use an LLM, infer speakers or retain multiple
candidate paths. A runtime adapter preserves its raw provider artifact and supplies the normalized
word, character, score and speech-activity evidence used here in exact 16 kHz sample coordinates.

The locator aligns one explicitly connected Script Segment against the acoustic evidence from that
same normalized Take. A bounded monotonic M:N dynamic
program accepts exact, split, merge, replacement, source-omission and evidence-insertion groups.
Within a selected group, timed evidence characters determine Script token boundaries; word times
and speech-activity bounds are fallbacks. Missing token runs receive continuous weighted windows
between their measured neighbors instead of invented point timestamps. The result is quantized once
into the Take's local frame domain and contains one timing for every Script token plus the Segment
and token boundary anchors. Segment anchors are exactly frame `0` and the Take frame count.

The public Producer accepts Narrative, one Segment excerpt, `SynchronizedMedia` and
`AlignedTranscriptEvidence` through explicit graph edges. Evidence carries no authored Segment
identity; the deterministic semantic step performs that association locally.

`speechAlignmentComponent` exposes this Segment-local projection as one enumerable deterministic Producer facet. Its
identity is checked against `speechAlignmentManifest` and executes through the host-neutral compute
port. The package depends only on public video
contracts and protocol utilities; it has no Core, Driver, Provider, Artifact, queue or credential
authority.

Caption display is outside this package. `@hypit/caption` composes the resulting complete speech
map with Script's explicit whole-Atom `CaptionCorrespondence`; it never asks this locator to infer
display text or display-Word timing.
