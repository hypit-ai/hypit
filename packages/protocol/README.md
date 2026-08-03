# `@svml/protocol`

Data-only v2 bootstrap contracts shared by Core, Drivers and future modules. The package defines
canonical values, module/type references, static raw/structured Surface declarations, records and
origins, explicit plans, Needs, Receipts, Derivations, events and commands. It contains no parser,
runtime or video vocabulary. A Surface declaration identifies and locks a parser capability; the
protocol never executes it. Every Surface also declares the exact set of record types it may
author, so a parser cannot use its early execution position to impersonate another module.
