# SVML roadmap

Status: active priorities after the `svml.graph@2` / Satisfaction redesign, 2026-08-07.

SVML can already execute one real paid talking-video build. The active roadmap is no longer “make a
video possible.” It is to make the domain-neutral system pleasant to operate and to make execution
environments replaceable. Video-style breadth is deliberately deferred.

## A. Domain-neutral system

### A1. Human-readable Run Graph

Implement the `.svrun` Frontend for:

- named Targets and reusable Target sets;
- Provided-Value and Fragment Candidates;
- explicit Satisfaction edges and fidelity;
- one multi-export instance shared by several outputs;
- separately instantiated identical implementations;
- imports of trusted Run packages.

The Frontend must compile completely before execution. It cannot contain credentials, Endpoint
bindings or an inline unversioned execution callback. The existing CLI `--pin` option remains only
temporary compatibility sugar until `.svrun` can express the same action.

### A2. Runtime Profile usability

The typed Runtime Profile/Closure API is implemented, but normal developers still assemble a
`svml.runtime.ts` module. Add a declarative profile form for Scheduler, Stores, credentials,
Endpoints, concurrency lanes and permissions. Keep executable TypeScript as the advanced embedding
API.

Runtime Profile is deployment configuration. It must not enter author semantic identity or
`.svrun` creative choices.

### A3. Public package lifecycle

- generate implementation locks through supported CLI commands;
- replace development implementation labels with release-built code identities;
- settle public package names without changing logical module identity;
- document install/update/restart behavior by facet;
- add `LICENSE`, contribution and security policy after the project chooses its license.

Explicit installation of trusted packages already works. Automatic package discovery and a package
marketplace are not prerequisites for the first developer release.

### A4. Trusted and untrusted extension levels

First make trusted local packages straightforward and diagnosable. Later add isolation for arbitrary
community Frontends, Producers and Validators:

- process or Wasm boundary;
- filesystem/network/environment permissions;
- CPU, memory, timeout and output limits;
- actual loaded-code digest verification;
- validator isolation or remote attestation.

### A5. Developer inspection

Add domain-neutral `doctor`, graph/plan inspection and structured diagnostics. A Record catalog may
support history search, but it must only help the user author explicit Candidates. There is no
automatic result reuse or hidden Candidate selection.

## B. Environment and Provider work

### B1. Repeatable live acceptance

Turn `examples/talking-film-live` into an opt-in acceptance suite that:

- never commits credentials or paid output;
- verifies exact Endpoint coverage before spending money;
- runs the complete generation, media, alignment, planning and render path;
- proves a second Build can use explicit Existing-Value Candidates without another generation call.

### B2. Remote execution only where demanded

Local media, WhisperX and parallel HyperFrames execution are implemented. Add AWS Endpoint packages
only when a deployment needs them:

- media inspection/normalization/audio/mux;
- WhisperX;
- HyperFrames rendering.

The generic Lambda transport already exists. Each Endpoint must return the existing capability and
contract; Lambda placement cannot define another media meaning.

### B3. Production environment adapters

- Keychain, Secrets Manager or Vault CredentialStore;
- production S3 streaming/multipart behavior when object size requires it;
- hosted Build/Operation stores and distributed leases only for a real multi-process deployment;
- artifact retention and garbage collection as deployment policy.

Authentication, tenants, credits, billing and dashboards belong to an embedding product such as
Hypit, not to open-source Core.

### B4. Additional Providers

KIE generation, Vertex Caption planning, local media, local WhisperX and local HyperFrames are
implemented. Volcengine, Fal, API-key Gemini or Hypit can be added as independent Endpoint packages.
They do not require changes to author model packages or Core.

## C. Deferred video-domain work

Do not freeze or greatly expand the video author surface yet. The deferred backlog includes:

- full Text three-box and exact-font behavior;
- Caption browser/pixel acceptance;
- B-roll foreground/backdrop media-box behavior;
- Ranking and other old production components;
- final Track and HyperFrames Visual IR compatibility freeze.

The current implementations remain executable vertical slices and regression witnesses while A and
B are completed.

## Explicit non-goals for the current phase

- no automatic cache or prompt-based semantic reuse;
- no Core `Pin` primitive;
- no Runtime guessing of creative method or model family;
- no universal queue package;
- no hosted multi-tenant platform required for local developer use;
- no cross-Track effect system or Base FX placeholder.
