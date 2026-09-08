# `@hypit/artifact`

Domain-neutral nominal contract for one byte Artifact referenced by a Runtime Resource id.

`BlobArtifact` wraps the Protocol `BlobRef` storage form in an owner-defined `TypeRef`, allowing any
domain to place files, model outputs or other immutable bytes on Graph edges without borrowing a
media/video type. Artifact storage and transfer remain separate Runtime ports implemented by
packages such as `@hypit/resource-store-fs` and `@hypit/resource-store-s3`.

The package has no filesystem, network, media or Provider behavior.
