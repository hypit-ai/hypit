# `@svml/artifact-store-fs`

A project-local, content-addressed implementation of the Runtime `ArtifactStore` port.

The path is deployment configuration. Artifact identity is the SHA-256 digest of its bytes, so the
same adapter can later be replaced by S3 without changing Core, component or Provider contracts.
This package does not store BuildState, Provider checkpoints, credentials or author library records.
