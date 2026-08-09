# `@narratage/driver-node`

Node runtime for executing Core commands without adding workflow semantics to Core.

Its Manifest helpers only read Node filesystem paths and construct a verified Closure. Pure static
Manifest JSON parsing belongs to `@narratage/protocol` and is re-exported here temporarily for callers of
the prototype API.

- `ProducerRegistry` implements the host-neutral `@narratage/component-kit` Producer registrar. Deterministic
  component packages depend on that tiny structural port, not on this Node Driver.
- `EndpointRegistry` binds an already explicit external capability to implementations that may use
  APIs, credentials, queues, local runtimes, devices or human services.
- Registrations may declare a scheduling lane and default concurrency. The environment-neutral
  `@narratage/runtime` Scheduler shares that lane across Builds; a Runtime Profile may override its limit.
- A Producer receives only its command identity and immutable typed inputs. It has no ArtifactStore,
  credentials, network, queue or store handle; external work must be emitted as a typed `Need`.
- Endpoints match the locked `CapabilityRef` and return `TypeRef`. Multiple exact endpoints require
  `bind()`. The Registry never routes by return type alone.
- Production-style assembly uses `applyRuntimeClosure()`: Endpoint instance, exact capability and
  return Type, implementation digest, non-secret configuration digest, declared credential slots
  and Profile-owned scheduling must all match atomically.
  Legacy direct `bind()` remains only as the low-level trusted test/embedding API.
- Long-lived external work uses `registerRecoverableEndpoint()`, not an immediate Handler. The Driver
  creates a content-addressed Operation before `start()`, persists pending checkpoints, calls
  `resume()` for an existing Operation, and replays a journaled completion without another external
  call. A recoverable Endpoint is blocked unless both its locked Runtime Closure and an
  `OperationStore` are present.
- Endpoint credentials are resolved only for the slots declared by that locked endpoint, immediately
  before `start/resume/cancel`; secret bytes never become Driver journal or Core state.
- A pending Endpoint may publish `wakeAt`. Retryable terminal failure creates a new attempt and
  submission key under the endpoint's finite retry policy; cancellation becomes an explicit terminal
  failure that Core accepts through its ordinary command-failed Event.
- Preview, fallback and reuse are graph-level Candidates selected by BuildRequest, not Endpoint
  modes. A reused value is an Existing-Value Candidate; “Pin” is only the host UI action that selects
  it. Satisfaction fidelity is sealed into the Core-derived plan before execution.
- Endpoint identity becomes the Receipt fulfiller. The Driver also copies the locked Endpoint
  implementation/configuration and applied Runtime closure digests into the Receipt; handlers return
  only value, conformance, delivery and metadata and cannot self-assert implementation identity.
- `TypeValidatorRegistry` is a separate exact-Type registry. Before an Event exists, the Driver
  structurally checks every result, executes the Type owner's digest-locked validator when declared,
  and attaches the resulting receipt. Producer and Endpoint handlers cannot self-assert validation.

Build state is serializable. Missing Endpoints, generation latency and transient endpoint errors pause a
build without replaying completed Producers.

`start()` and `resume()` receive the same stable submission key. `resume(undefined)` is intentional:
it covers a stop after submission intent was journaled but before a remote job checkpoint was saved.
The Endpoint must use that key to find-or-submit idempotently; the Driver cannot manufacture remote
exactly-once semantics for an API that does not provide them.

`prepare()` regenerates and classifies the exact current Core commands. `executeCommand()` accepts
only one regenerated command id, so a Scheduler cannot smuggle modified serialized command content
into a paid Handler. `NodeDriver.run()` remains the simple serial convenience path; multi-Build and
within-Build parallelism belong to `LocalBuildScheduler`, not to an Endpoint-specific queue.
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
