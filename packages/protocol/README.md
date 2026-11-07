# `@hypit/protocol`

Data contracts shared across package boundaries.

This package defines module manifests, nominal references, typed values, AuthorGraph,
build plans, Core commands, command results, build facts and neutral publication requests. It also
parses a module manifest from JSON without loading executable package code. The materialized
`BuildView` belongs to `@hypit/kernel`; it is not a protocol document.

Protocol contains no source parser, package loader, runtime, filesystem access or video vocabulary.
Source units and source ranges belong to `@hypit/source`; Protocol records only graph and execution
meaning after source-local structure has been decoded.
`BlobRef` is the reserved byte-resource leaf inside a recursive `Value`. `valueBlobRefs` reports
each occurrence as `{ at, blob }`, while `mapValueBlobs` returns `BlobMappedValue<T>` after replacing
those leaves; neither API assigns media-domain meaning to the bytes.
Packages own their types, producers and capabilities by module name and version. Core and Hosts
communicate through those names and the values declared here.
`PublicationIntent` carries the completed Record, its author-facing name, an exact domain-owned
publisher and optional publisher parameters. Build Targets remain separate execution evidence and do
not become products merely by being demanded. Protocol defines only this transport envelope: publisher
behavior, graph identities, paths, writer state and physical storage stay outside Protocol and Compiler.
