# `@svml/core`

Experimental v2 bootstrap microkernel.

The package accepts an already resolved module closure, typed authored modules and an explicit
finite build plan. It validates identities, schemas, immutable records, Needs, Receipts and
Derivations, then advances a serializable `BuildState` with pure `reduce(state, event)` calls.

Derivations bind Producer and implementation identity, input/output Record digests, Need request
digests and the accepted event digest. Needs carry the conformance floor inherited from their
inputs, so an exact external response cannot wash a substitute upstream back to exact. An exact
Need above a substitute floor fails before an external Handler can run.

It generically verifies Surface declarations in the same immutable module closure, but never
parses or dispatches one. It does not parse source, resolve package locations, execute
implementations, access artifact bytes, select providers or search for a workflow. Those
responsibilities remain outside Core.
