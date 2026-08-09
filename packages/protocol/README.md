# `@narratage/protocol`

Execution-free wire contracts shared by Core, Drivers and future modules. The package defines
canonical values, module/type references, static raw/structured Surface declarations, records and
origins, explicit plans, Needs, Receipts, Derivations, events and commands. It also parses the static
JSON representation of a Module Manifest without reading files or executing package code. It
contains no author-source parser, runtime or video vocabulary. A Surface declaration identifies and
locks a parser capability; the protocol never executes it. Every Surface also declares the exact set of record types it may
author, so a parser cannot use its early execution position to impersonate another module.

A Type declaration may lock an optional `svml.type-validator@1` implementation. This is still
data-only: Protocol describes the validator and its content-bound receipt but never loads or runs
code. Structural Schema, semantic refinement execution and receipt verification remain separate
responsibilities.

A Need fulfillment may carry a Host-attested implementation binding: locked Endpoint implementation
digest, non-secret configuration digest and applied Runtime closure digest. The Endpoint does not
supply this value. Receipt content addressing covers the binding and any renderer-specific evidence
stored in fulfillment metadata without teaching Protocol what a renderer is.
