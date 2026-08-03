# `@svml/driver-node`

Node runtime for executing Core commands without adding workflow semantics to Core.

- `HostRegistry` registers deterministic Producer implementations locked by implementation digest.
- `ProviderRegistry` registers external capabilities that may use APIs, credentials, queues or local runtimes.
- A Producer emits a typed `Need`; it never reads provider configuration directly.
- One matching Provider may fulfill a Need. Multiple matches require an explicit runtime `bind()`.
- Provider identity becomes the Receipt fulfiller; handlers return only value, conformance, delivery and metadata.

Build state is serializable. Missing providers, generation latency and transient provider errors pause a
build without replaying completed Producers.

The Driver still does not load implementation code from a package locator. A future sandboxed executor
must be designed and audited before third-party implementations can run. Frontend and Import Prologue
behavior remain outside this package.
