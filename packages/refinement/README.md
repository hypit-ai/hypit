# `@hypit/refinement`

Package-owned semantic refinements for nominal types.

Core checks nominal type connections. A component package may additionally register one pure
refinement for an exact `TypeRef`. The compiler checks that refinement against authored and
provided values; `Executor` checks it against component and endpoint results before offering them
to Core.

A refinement only accepts or rejects. It cannot rewrite a value, create graph edges, select an
endpoint, read credentials or add author intent. The registry executes trusted installed handlers
in process. It therefore narrows the values admitted for a nominal type without becoming another
type system or a central domain schema.
