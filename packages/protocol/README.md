# `@svml/protocol`

Execution-free v2 bootstrap contracts shared by Core, Drivers and future modules. The package defines
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
