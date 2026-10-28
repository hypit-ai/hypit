# `@hypit/protocol`

Data contracts shared across package boundaries.

This package defines module manifests, nominal references, typed values, AuthorGraph, Invocation,
build plans, Core commands, command results, build facts and neutral publication intent. It also
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
`PublicationIntent` carries only the selected public name, Logical Output, Type, target membership
and selected Record id. Result repositories consume that intent but keep paths,
writer state and physical storage out of Protocol and Compiler.
