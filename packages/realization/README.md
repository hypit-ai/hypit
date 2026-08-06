# `@svml/realization`

Content-addressed Candidate attachment outside SVML Core.

A `svml.realization-overlay@1` locks the exact author Graph and contributes Candidates plus any
already elaborated Operations. `resolveRealization()` merges one or more Overlays deterministically,
retains the author source digest, records a separate Realization Closure digest, and produces the
final `CompiledGraph` consumed by Build Compiler.

An attached Candidate is inert. It enters a finite BuildPlan only when a `BuildRequest` explicitly
selects it and a Target reaches its Logical Output. Product UI actions such as “Pin” create or locate
an Existing-Value Candidate and then write that ordinary selection; they do not mutate Core state or
require a database.

`createHistoricalCandidate()` is a Host convenience for this common case. It verifies the complete
prior `BuildState` only to extract a trusted typed Record, its type-validation receipt and optional
provenance. It then reattaches that value to the current Logical Output as an ordinary zero-input
`substitute` Candidate. The previous author Graph, prompt, semantic inputs and affinity are not
compatibility evidence and are not compared. No historical Operation, Command or outstanding work
is copied into the new Build.

The same model covers an uploaded video, a fixed black clip and any other already materialized
value. Core checks the current output Type and value structure. A `substitute` Candidate need not
prove the current output's author affinity; the BuildRequest must explicitly select it and the
Target must explicitly accept substitute fidelity.
