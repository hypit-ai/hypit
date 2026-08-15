# `@narratage/protocol`

Execution-free wire contracts shared by Core, Drivers and future modules. The package defines
canonical values, module/type references, records and origins, explicit plans, Needs, Receipts,
Derivations, events and commands. It also parses the static
JSON representation of a Module Manifest without reading files or executing package code. It
contains no author-source parser, Surface, runtime or video vocabulary. Source syntax belongs to the
Frontend Host that executes it, not to the semantic Module protocol.

Types and Producers are named by their owning `TypeRef` and `ProducerRef`. Manifests declare that
shared vocabulary; executable validators and handlers stay in the package that owns it. Protocol
does not assign hashes or second identities to JavaScript functions.

A Need Receipt records the exact request, selected Endpoint name and returned Record. It carries no
Runtime snapshot, package inventory, domain lineage or renderer-specific metadata. Graph edges and
Derivations retain facts at their actual source.
