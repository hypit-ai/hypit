# `@narratage/protocol`

Execution-free wire contracts shared by Core, Drivers and future modules. The package defines
canonical values, module/type references, records and origins, explicit plans, Needs, Receipts,
Derivations, events and commands. It also parses the static
JSON representation of a Module Manifest without reading files or executing package code. It
contains no author-source parser, Surface, runtime or video vocabulary. Source syntax belongs to the
Frontend Host that executes it, not to the semantic Module protocol.

A Type declaration may lock an optional validator implementation digest. This is still data-only:
Protocol describes the validator and its content-bound receipt but never loads or runs code.
Structural Schema, semantic refinement execution and receipt verification remain separate
responsibilities. Producer and validator implementations are already named by their owning
`ProducerRef` or `TypeRef`; Manifests do not carry a second locator or implementation-kind label.

A Need fulfillment may carry one Host-attested binding to the selected Endpoint implementation and
its non-secret configuration. The Endpoint does not supply this value, and the Receipt carries no
Runtime snapshot, domain lineage or renderer-specific metadata. Graph edges and Derivations retain
those facts at their actual source.
