# `@hypit/core`

The domain neutral graph compiler and build state machine.

Core links module declarations, validates a compiled graph and walks backwards from the requested
targets. Explicit candidate selections decide how each logical output is realized. The result is a
finite `BuildPlan` containing only the operations needed for that build.

Execution is one immutable `BuildDefinition` followed by accepted `BuildFact` values. `BuildMachine`
reconstructs the current view, emits the next commands and accepts their results. The materialized
`BuildState` is a disposable view rather than durable authority.

Core does not parse source files, load packages, execute components, call providers, store artifact
bytes or know what a video is. Those responsibilities remain in compiler and runtime packages.
