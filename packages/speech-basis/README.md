# `@narratage/speech-basis`

Reference Product/Projection package for an atomic speech take.

`SpeechBasis` is the indivisible Product that binds audio, visual clips and ProgramSpace. Its
identity belongs to the enclosing Core Record; the domain value does not repeat a self digest or
copy an upstream identity. Four ordinary deterministic Producers project it into `ProgramSpace`,
`SpeechAudioBasis`, `VisualTrack` and `AudioTrack`. Core has no Projection primitive and never treats
these outputs as ports of one mutable workflow node.

This gives the author several independent Logical Outputs while preserving one shared generation
Operation. Selecting an Existing `SpeechBasis` stops generation and leaves both Projections usable;
selecting only an Existing visual Candidate does not change the independent audio path.

`speechBasisComponent` enumerates all four Producer facets. Their identities are checked against the
static `speechBasisManifest` and can be activated by any compatible compute Host selected by Source
imports without a Driver or Runtime source change. The component has no Provider,
Artifact access, queue or credentials.

The package intentionally publishes no Type validators: it does not own any of its input or output
Types. `@narratage/speech`, `@narratage/program-space` and `@narratage/composition` remain the
semantic owners of `SpeechBasis`, `ProgramSpace` and the generic Track Types, and supply any owner
validators required by those contracts.
