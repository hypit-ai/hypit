# `@narratage/artifact`

Domain-neutral nominal contract for one content-addressed byte Artifact.

`BlobArtifact` wraps the Protocol `BlobRef` storage form in an owner-defined `TypeRef`, allowing any
domain to place files, model outputs or other immutable bytes on Graph edges without borrowing a
media/video type. Artifact storage and transfer remain separate Runtime ports implemented by
packages such as `@narratage/artifact-store-fs` and `@narratage/artifact-store-s3`.

The package has no filesystem, network, media or Provider behavior.
