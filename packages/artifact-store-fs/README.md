# `@narratage/artifact-store-fs`

A project-local, content-addressed implementation of the Runtime `ArtifactStore` port.

The path is deployment configuration. Artifact identity is the SHA-256 digest of its bytes, so the
same adapter can later be replaced by S3 without changing Core, component or Endpoint contracts.
This package does not store BuildState, Endpoint checkpoints, credentials or author library records.

`createFileArtifactStorePackage()` contributes the configured store through the generic Runtime
Component Adapter protocol. Its absolute root is bound into Runtime instance identity; the Local Host
does not need filesystem-specific registration code.
