# `@hypit/refinement`

Package-owned semantic refinements for nominal types.

Core checks nominal type connections. A component package may additionally register one pure
refinement for an exact `TypeRef`. The compiler checks that refinement against authored Records and
Run-selected local values or files; `Executor` checks it against Producer and Endpoint results
before offering them to Core.

A refinement only accepts or rejects. It cannot rewrite a value, create graph edges, select an
endpoint, read credentials or add author intent. The registry executes trusted installed handlers
in process. It therefore narrows the values accepted for a nominal type without becoming another
type system or a central domain schema.
