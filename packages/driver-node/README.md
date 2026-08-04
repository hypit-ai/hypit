# `@svml/driver-node`

Node runtime for executing Core commands without adding workflow semantics to Core.

- `HostRegistry` registers deterministic Producer implementations locked by implementation digest.
- `ProviderRegistry` binds an already explicit external capability to endpoints that may use APIs, credentials, queues or local runtimes.
- A Producer emits a typed `Need`; it never reads provider configuration directly.
- Providers match the locked `CapabilityRef` and return `TypeRef`. Multiple exact endpoints require
  `bind()`. The Registry never routes by return type alone.
- Preview, fallback and reuse are graph-level Candidates selected by BuildRequest, not Provider
  modes. A reused value is an Existing-Value Candidate; “Pin” is only the host UI action that selects
  it. Candidate fidelity is sealed into the Core-derived plan before execution.
- Provider identity becomes the Receipt fulfiller; handlers return only value, conformance, delivery and metadata.

Build state is serializable. Missing providers, generation latency and transient provider errors pause a
build without replaying completed Producers.

Outstanding Commands are not trusted persistence. Serialization drops them and Core regenerates
the exact commands from verified facts on resume, before any Handler can run. The Registry never
turns a generic speaker request into a model choice: Seedance, WhisperX or another external method
must already be present as a specific Need in the locked BuildPlan.
The BuildPlan itself is derived and sealed by Core from the locked CompiledGraph and BuildRequest.

The Driver still does not load implementation code from a package locator. A future sandboxed executor
must be designed and audited before third-party implementations can run. Frontend and Import Prologue
behavior remain outside this package.
