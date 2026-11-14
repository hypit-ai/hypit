# Internal shared value representation

This workspace module is an implementation seam, not a public universal Hypit protocol. The
Distribution exposes canonical values and byte-resource leaves through `@hypit/hypit/value`, and
semantic Module／Type／Capability identities through `@hypit/hypit/module`.

The current implementation contains canonical `Value`, `BlobRef`, resource identity and ordering helpers.
Module／Type／Capability references, semantic Module manifests and Producer identity belong to
`@hypit/module`; AuthorGraph, Build plans, commands, facts, Build ids and publication intent belong
to `@hypit/generation-build`. NLE, Media, Scene and Feedback keep their own domain documents.

The shared implementation contains no source parser, package loader, runtime, filesystem access or video vocabulary.
Source units and source ranges belong to `@hypit/generation-authoring/source`; graph and execution meaning are not smuggled
back into the Value or Module foundation merely because several Generation packages exchange them.
`BlobRef` is the reserved byte-resource leaf inside a recursive `Value`. `valueBlobRefs` reports
each occurrence as `{ at, blob }`, while `mapValueBlobs` returns `BlobMappedValue<T>` after replacing
those leaves; neither API assigns media-domain meaning to the bytes.
