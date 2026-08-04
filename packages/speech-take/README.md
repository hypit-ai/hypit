# `@svml/speech-take`

Reference Product/Projection package for an atomic speech take.

`SpeechBasis` is the indivisible Product that binds audio, visual clips, ProgramSpace and
`basisDigest`. `project-audio` and `project-visual` are ordinary deterministic Producers. Core has no
Projection primitive and never treats these outputs as ports of one mutable workflow node.

This gives the author several independent Logical Outputs while preserving one shared generation
Operation. Selecting an Existing `SpeechBasis` stops generation and leaves both Projections usable;
selecting only an Existing visual Candidate does not contaminate the independent exact audio path.
