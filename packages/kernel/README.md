# `@hypit/kernel`

The domain neutral graph compiler and build state machine.

Core plans one complete Author Graph for an explicit finite target set. Starting at the Targets, it
follows each target through the Author Graph's fixed production relations,
and derives one finite execution closure without rewriting the Author Graph.

Execution is one immutable `BuildDefinition` followed by accepted `BuildFact` values. `BuildMachine`
reconstructs the current view, emits the next commands and accepts their results. The materialized
`BuildView` is a disposable view rather than durable authority.
Within one live Build, the machine keeps disposable Record/Need/Command indexes, missing-input
counts, reverse Record dependencies and the remaining Goals. A committed Fact therefore wakes only
the steps whose inputs changed. These indexes are neither serialized nor shared across Builds and
can always be reconstructed from the Definition and Facts. `evaluate` still derives the exact Fact
before mutation; `commit` advances the indexes only after the caller has durably appended it. The
constructor replays stored Facts through that same accepted-Fact transition, so replay and live
execution cannot acquire separate scheduling semantics. `materializeBuild` is only a read-view
projection over this machine; it is not another reducer.
`BuildDefinition` contains only the selected Program, its initial Records, Producer steps and Goal
Record identities. Author Graph roots and target resolution end at the planning boundary.

Core does not parse source files, load packages, execute components, call providers, store artifact
bytes or know what a video is. Those responsibilities remain in compiler and runtime packages.
