# `@narratage/artifact-store-fs`

A project-local, content-addressed implementation of the Runtime `ArtifactStore` port.

The path is deployment configuration. Artifact identity is the SHA-256 digest of its bytes, so the
same adapter can later be replaced by S3 without changing Core, component or Endpoint contracts.
This package does not store BuildState, Endpoint checkpoints, credentials or author library records.

`createFileArtifactStorePackage()` creates one Runtime infrastructure instance exposing the `store`
part with the `artifact-store` role. Its absolute root is bound into that instance's identity; the
Runtime Host does not need filesystem-specific registration code.
