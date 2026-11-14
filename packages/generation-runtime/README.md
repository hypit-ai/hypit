# @hypit/generation-runtime

Execution state and scheduling for Generation Builds.

This package owns Build and Operation lifecycles, command scheduling, execution logs, and Build-scoped capacity reservations. It consumes the generic credential, endpoint, capacity, and invocation facts from `@hypit/execution-environment`; it is not the runtime for NLE, media indexing, workbenches, or other Hypit domains.
