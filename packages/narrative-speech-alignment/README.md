# `@hypit/narrative-speech-alignment`

Provider-neutral deterministic timing locator for one authored Segment on an exact local temporal
domain. The package does not
invoke Python, read audio, call a speech provider, use an LLM, infer speakers or retain multiple
candidate paths. A runtime adapter preserves its raw provider artifact and supplies the provider-neutral
word, character, score and speech-activity evidence used here in exact 16 kHz sample coordinates.

This is an independently versioned and packaged algorithm, not a root SDK facade and not a WhisperX
implementation. The official video Distribution depends on it directly; any transcription package
producing the same provider-neutral evidence can compose with it.
The project package manager and lockfile own the selected physical version.

The locator aligns one explicitly connected Script Segment against acoustic evidence with an exact
sample span. A bounded monotonic M:N dynamic
program accepts exact, split, merge, replacement, source-omission and evidence-insertion groups.
Within a selected group, timed evidence characters determine Script token boundaries; word times
and speech-activity bounds are fallbacks. Missing token runs receive continuous weighted windows
between their measured neighbors instead of invented point timestamps. The result preserves
sample-derived boundaries as exact local time and contains one timing for every Script token plus the
Segment and token boundaries. Segment boundaries are exactly local zero and the domain's exact
duration. Quantization to frames happens later in Narrative Projection, after a Timeline Clock has
been selected.

The public Producer accepts Narrative, one Segment excerpt, its `LocalTemporalDomain` and
`SpeechTranscriptEvidence` through explicit graph edges. It does not reopen `PreparedMedia` to
recover audio or duration. Evidence carries a measured sample span but no local-domain or authored
Segment identity; this deterministic step makes those associations explicitly and rejects a sample
span that does not equal the supplied domain duration.

The package owns `<speechalign:Alignment>`. A token-bearing Segment requires `evidence`; an empty
Segment maps directly to the supplied domain boundaries and omits it. The same Surface accepts live
provider evidence and evidence imported from an editable `<speech:Transcript>` Source.

`speechAlignmentComponent` exposes this Segment-local alignment as one enumerable deterministic Producer facet. Its
identity is checked against `speechAlignmentManifest` and executes through the host-neutral compute
port. Its graph boundary contains only Narrative, a local Temporal Domain, provider-neutral Evidence
and NarrativeAlignment. The package has no Media, Driver, Provider, queue or credential authority.

Caption display is outside this package. `@hypit/narrative-caption` combines an independently owned
Caption document/binding with the resulting Narrative timing; it never asks this locator to infer
display text or display-unit timing.

The result is the `@hypit/narrative-temporal` `NarrativeAlignment`, not media and not a Timeline.
An explicit Narrative Projection from that package later combines one or more
`NarrativeAlignment + LocalTemporalDomain + placed Window` relations for a chosen Timeline. Visual,
audio and caption consumers then request absolute Instants or Windows through that declared relation;
Timeline and Core do not enumerate semantic event kinds.
