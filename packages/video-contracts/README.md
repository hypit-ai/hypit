# `@narratage/video-contracts` physical video distribution

This transitional physical workspace package delivers six independently identified logical modules:

- `@narratage/narrative`;
- `@narratage/media`;
- `@narratage/program-space`;
- `@narratage/speech`;
- `@narratage/semantic-time`;
- `@narratage/composition`.

Each has its own Manifest and digest. The physical package name is not a public nominal Type owner
and may later become `@narratage/video` without changing those logical identities. The distribution
contains Provider- and Frontend-neutral data contracts, identity validators and static schemas
only. It does not parse SVML, execute external services, align speech or render Tracks.

The domain-neutral `BlobArtifact` owner is `@narratage/artifact`, not `@narratage/media`. This video
distribution depends on that module and re-exports its symbols only as a migration convenience;
video packages that put byte Artifacts on Graph edges declare the Artifact dependency directly.

The Narrative module provides distinct narrow views instead of making every consumer depend on one
parser-specific object: `NarrativeExcerpt` associates a Take with a Segment,
`NarrativeDialogueExcerpt` carries Role-aware spoken prompt text,
`NarrativeSpeechExcerpt` carries pronunciation-only estimate text, and `CaptionProjectionRef`
identifies the whole display-side Caption truth. They keep model and Caption packages independent of
the official Script parser. The actual `<media:Image>` Surface implementation likewise lives in the
separate physical `@narratage/media` package.

`VisualTrack`, `AudioTrack` and `Composition` implement the flat composition law in
[`../../spec/track-composition.md`](../../spec/track-composition.md). Caption, Speech and
B-roll are upstream package concerns; the final Composition contract contains no family field.
`VisualTrack` is one self-contained render contribution, while each `VisualPresent` owns its own
frame span and absolute z so Presents from different Tracks may interleave without cross-Track
access. Upstream ownership and provenance live in the Graph and Derivation rather than a generic
`sources[]` field copied into every Track.

Every VisualTrack explicitly binds the closed
[`svml.hyperframes-visual-ir@1`](../../spec/hyperframes-visual-ir.md) target. This is the common
video rendering protocol, not a component "dialect": packages may lower their private Programs to
it, but may not extend it with arbitrary CSS. The physical contracts distribution owns its schema
and identity validation; Core does not know that it exists.

Two content-bound terminal dependencies close otherwise leaky rendering assumptions:

- `FontArtifactRef` binds an exact font face, weight and style to content-addressed bytes;
- `CompositableSurfaceRef` binds a materialized visual's dimensions, sRGB color space, alpha mode
  and still/frame timing to content-addressed bytes.

These are public protocols, not author components and not Provider APIs. Text, Caption or any
future visual component may emit them without registering its family with Core.
