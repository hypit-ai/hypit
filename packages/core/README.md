# `@hypit/core`

The domain neutral graph compiler and build state machine.

Core links module declarations and plans one complete Author Graph together with one complete Run
Graph. Starting at the Targets, it applies explicit satisfactions, follows every dependency introduced
by the selected Candidates, and derives one finite execution closure without rewriting either source
graph.

Execution is one immutable `BuildDefinition` followed by accepted `BuildFact` values. `BuildMachine`
reconstructs the current view, emits the next commands and accepts their results. The materialized
`BuildState` is a disposable view rather than durable authority.
`BuildDefinition` contains only the selected Program, initial Records, Producer steps,
`Output -> Record` bindings and Targets. Graphs, satisfactions and Candidate identities end at the
planning boundary.

Core does not parse source files, load packages, execute components, call providers, store artifact
bytes or know what a video is. Those responsibilities remain in compiler and runtime packages.
