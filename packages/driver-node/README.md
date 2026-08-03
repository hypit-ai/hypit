# `@svml/driver-node`

Experimental Node Host for the v2 Core.

Driver v0 reads explicitly supplied static `svml.module.json` files, runs Host-registered producer
functions, dispatches typed Needs to registered handlers, stores content-addressed bytes and can
serialize or resume Core state.

It deliberately does not load implementation code from a package locator. A future sandboxed
executor must be designed and audited before third-party implementations can run. Frontend and
Import Prologue behavior are also outside this package version.
