# `@narratage/core`

The domain-neutral Demand compiler and verified Build state machine.

The package accepts an already resolved module closure, typed authored modules, a complete
`svml.graph@1` and a `svml.build-request@1`. It verifies explicit Satisfaction and compiles the finite
BuildPlan by traversing backwards from every Target, resolving Logical Outputs and memoizing shared
atomic Operations by stable OperationId during compilation. The BuildPlan is frozen before any
external Command; execution performs no Candidate selection, graph mutation or content-based
deduplication. It then validates immutable Records, Needs, Receipts and
Derivations and advances a serializable `BuildState` with pure `reduce(state, event)` calls.

Derivations bind Producer and implementation identity, input/output Record digests, Need request
digests and the accepted event digest. Need Receipts content-address the Driver-attested Endpoint
implementation/configuration/Runtime closure binding when present, without Core learning what that
implementation does. Needs carry the conformance floor inherited from their
inputs, so an exact external response cannot wash a substitute upstream back to exact. An exact
Need above a substitute floor fails before an external Handler can run.

Cross-package Types are nominal: exact module name, version and type name must match. Core checks
their package-owned structural Schema. If the Type owner locked a semantic validator in its
Manifest, every authored, provided, Producer or Provider Record must also carry a validation
receipt bound to the exact Type, value digest and locked validator digest. Core verifies this
receipt uniformly but never executes the validator; trusted Host admission lives in
`@narratage/validation`.

It generically verifies Surface declarations in the same immutable module closure, but never
parses or dispatches one. It does not parse source, resolve package locations, execute
implementations, access artifact bytes, select Provider endpoints or discover undeclared graph
structure. Those responsibilities remain outside Core. The normative laws are in
[`../../spec/core-kernel.md`](../../spec/core-kernel.md).

For a non-video domain, the irreducible reusable base is only `@narratage/protocol` plus `@narratage/core`.
Most source languages will also use `@narratage/elaborator` to turn modular component declarations into a
Graph, and a Driver/Runtime package to execute Commands. `@narratage/text`, `@narratage/run` and every
domain contract package are optional layers; none receives Kernel privilege by being official.
Domains that declare semantic Type validators additionally need a Host admission implementation;
the reference one is `@narratage/validation`.
