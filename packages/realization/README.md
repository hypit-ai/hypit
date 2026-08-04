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
