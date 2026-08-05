# `@svml/driver-node`

Node runtime for executing Core commands without adding workflow semantics to Core.

Its Manifest helpers only read Node filesystem paths and construct a verified Closure. Pure static
Manifest JSON parsing belongs to `@svml/protocol` and is re-exported here temporarily for callers of
the prototype API.

- `HostRegistry` registers deterministic Producer implementations locked by implementation digest.
- `ProviderRegistry` binds an already explicit external capability to endpoints that may use APIs, credentials, queues or local runtimes.
- Registrations may declare a scheduling lane and default concurrency. The environment-neutral
  `@svml/runtime` Scheduler shares that lane across Builds; a Runtime Profile may override its limit.
- A Producer emits a typed `Need`; it never reads provider configuration directly.
- Providers match the locked `CapabilityRef` and return `TypeRef`. Multiple exact endpoints require
  `bind()`. The Registry never routes by return type alone.
- Production-style assembly uses `applyRuntimeClosure()`: Endpoint instance, exact capability and
  return Type, implementation facet digest and Profile-owned scheduling must all match atomically.
  Legacy direct `bind()` remains only as the low-level trusted test/embedding API.
- Long-lived external work uses `registerProviderEndpoint()`, not an immediate Handler. The Driver
  creates a content-addressed Operation before `start()`, persists pending checkpoints, calls
  `resume()` for an existing Operation, and replays a journaled completion without another external
  call. A recoverable Endpoint is blocked unless both its locked Runtime Closure and an
  `OperationStore` are present.
- Preview, fallback and reuse are graph-level Candidates selected by BuildRequest, not Provider
  modes. A reused value is an Existing-Value Candidate; “Pin” is only the host UI action that selects
  it. Candidate fidelity is sealed into the Core-derived plan before execution.
- Provider identity becomes the Receipt fulfiller; handlers return only value, conformance, delivery and metadata.
- `TypeValidatorRegistry` is a separate exact-Type registry. Before an Event exists, the Driver
  structurally checks every result, executes the Type owner's digest-locked validator when declared,
  and attaches the resulting receipt. Producer and Provider handlers cannot self-assert validation.

Build state is serializable. Missing providers, generation latency and transient provider errors pause a
build without replaying completed Producers.

`start()` and `resume()` receive the same stable submission key. `resume(undefined)` is intentional:
it covers a stop after submission intent was journaled but before a remote job checkpoint was saved.
The Endpoint must use that key to find-or-submit idempotently; the Driver cannot manufacture remote
exactly-once semantics for an API that does not provide them.

`prepare()` regenerates and classifies the exact current Core commands. `executeCommand()` accepts
only one regenerated command id, so a Scheduler cannot smuggle modified serialized command content
into a paid Handler. `NodeDriver.run()` remains the simple serial convenience path; multi-Build and
within-Build parallelism belong to `LocalBuildScheduler`, not to a Provider-specific queue.
Callers using a recoverable Endpoint through the serial path must pass a stable Build identity as
`run(state, { build })`; the Driver deliberately does not derive one from BuildRequest content,
because two identical requests may still be distinct Builds. The Scheduler always supplies its
declared Build id.

Outstanding Commands are not trusted persistence. Serialization drops them and Core regenerates
the exact commands from verified facts on resume, before any Handler can run. The Registry never
turns a generic speaker request into a model choice: Seedance, WhisperX or another external method
must already be present as a specific Need in the locked BuildPlan.
The BuildPlan itself is derived and sealed by Core from the locked CompiledGraph and BuildRequest.

The Driver still does not load implementation code from a package locator. A future sandboxed executor
must be designed and audited before third-party implementations can run. Frontend and Import Prologue
behavior remain outside this package.
