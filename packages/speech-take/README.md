# `@svml/speech-take`

Reference Product/Projection package for an atomic speech take.

`SpeechBasis` is the indivisible Product that binds audio, visual clips, ProgramSpace and
`basisDigest`. Four ordinary deterministic Producers project it into `ProgramSpace`,
`SpeechAudioBasis`, `VisualTrack` and `AudioTrack`. Core has no Projection primitive and never treats
these outputs as ports of one mutable workflow node.

This gives the author several independent Logical Outputs while preserving one shared generation
Operation. Selecting an Existing `SpeechBasis` stops generation and leaves both Projections usable;
selecting only an Existing visual Candidate does not contaminate the independent exact audio path.

`speechTakeComponent` enumerates all four Producer facets. Their identities are checked against the
static `speechTakeManifest`, enter the installed implementation package lock, and can be activated by
any compatible compute Host without a Driver or Runtime source change. The component has no Provider,
Artifact access, queue or credentials.

The package intentionally publishes no Type validators: it does not own any of its input or output
Types. `@svml/contracts` remains the semantic owner of `SpeechBasis`, `ProgramSpace` and the generic
Track Types and supplies any owner validators required by those contracts.
