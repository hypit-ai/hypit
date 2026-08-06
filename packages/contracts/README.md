# `@svml/contracts` physical video distribution

This transitional physical workspace package delivers six independently identified logical modules:

- `@svml/narrative`;
- `@svml/media`;
- `@svml/program-space`;
- `@svml/speech`;
- `@svml/semantic-time`;
- `@svml/composition`.

Each has its own Manifest and digest. The physical package name is not a public nominal Type owner
and may later become `@svml/video` without changing those logical identities. The distribution
contains Provider- and Frontend-neutral data contracts, identity validators and static schemas
only. It does not parse SVML, execute external services, align speech or render Tracks.

`NarrativeExcerpt` is the shared contiguous author-selection contract used by
`script.segment.<id>` and speech-capable generation packages. It keeps model packages independent
of the official Script parser; the actual `<media:Image>` Surface implementation likewise lives in
the separate physical `@svml/media` package.

`VisualTrack`, `AudioTrack` and `Composition` implement the flat composition law in
[`../../spec/track-composition-v1.md`](../../spec/track-composition-v1.md). Caption, Speech and
B-roll are upstream package concerns; the final Composition contract contains no family field.
`VisualTrack` is one self-contained render contribution, while each `VisualPresent` owns its own
frame span and absolute z so Presents from different Tracks may interleave without cross-Track
access. Upstream ownership and provenance live in the Graph and Derivation rather than a generic
`sources[]` field copied into every Track.

Every VisualTrack explicitly binds the closed
[`svml.hyperframes-visual-ir@1`](../../spec/hyperframes-visual-ir-v1.md) target. This is the common
video rendering protocol, not a component "dialect": packages may lower their private Programs to
it, but may not extend it with arbitrary CSS. The physical contracts distribution owns its schema
and identity validation; Core does not know that it exists.

Two content-bound terminal dependencies close otherwise leaky rendering assumptions:

- `FontArtifactRef` binds an exact font face, weight and style to content-addressed bytes;
- `CompositableSurfaceRef` binds a materialized visual's dimensions, sRGB color space, alpha mode
  and still/frame timing to content-addressed bytes.

These are public protocols, not author components and not Provider APIs. Text, Caption or any
future visual component may emit them without registering its family with Core.
