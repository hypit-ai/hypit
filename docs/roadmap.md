# Narratage roadmap

Status: active priorities after the `svml.graph@1` / Satisfaction redesign, 2026-08-07.

Narratage can already execute one real paid talking-video build. The active roadmap is no longer “make a
video possible.” It is to make the domain-neutral system pleasant to operate and to make execution
environments replaceable. Video-style breadth is deliberately deferred.

## A. Domain-neutral system

### A1. Self-described Author/Run compilation — first public slice implemented

Every Author and Run source now carries a mandatory exact Frontend Header. The official
`@narratage/run-text` `.svrun` Frontend implements:

- named Targets and reusable Target sets;
- Provided-Value and Fragment Candidates;
- explicit Satisfaction edges and fidelity;
- one multi-export instance shared by several outputs;
- separately instantiated identical implementations;
- imports of trusted Run packages.

The Author Graph and complete Run Graph compile and bind into one final graph before execution. The
Frontend cannot contain credentials, Endpoint bindings or an inline unversioned execution callback.
The CLI no longer accepts `--pin`, `--target` or `--accept-substitute`; they would be invisible Run
Graph mutations.

Run-only Fragment Modules now extend a separately identity-bound execution Program Closure without
polluting Author imports. Trusted Fragment libraries use the generic Host Facet envelope rather than
a Package Loader special case. Remaining A1 work is diagnostics and public packaging, not another
graph model.

### A2. Runtime Profile usability — first public slice implemented

The typed Runtime Profile/Closure API now has a declarative `svml.runtime.json` Host frontend for
Scheduler defaults, replacement services, credential references, Endpoints, lanes and permissions.
Adapter names resolve from a separately verified physical package closure; the generic and video
CLIs import no Provider implementation. Effective Runtime implementation identity binds actual
package bytes, not a self-asserted development label. `doctor` checks locks, configuration,
credentials and executables without running a Build. Executable TypeScript remains the advanced
trusted embedding API.

Runtime Profile is deployment configuration. It must not enter author semantic identity or
`.svrun` creative choices.

Before calling `doctor` structurally read-only for third-party adapters, split adapter configuration
validation from `create()`. The current trusted-package implementation invokes `create()` after
adapter diagnostics to catch invalid configuration; an adapter constructor is therefore trusted not
to open a service, write state or issue a request during diagnosis. Diagnostics should also
coalesce a missing prerequisite instead of reporting both the prerequisite and the resulting
construction failure.

### A3. Public package lifecycle

- generate implementation locks through supported CLI commands;
- replace development implementation labels with release-built code identities;
- settle public package names without changing logical module identity;
- publish the already separated generic CLI engine and explicit video CLI Distribution;
- emit compiled ESM/declarations and verify npm, pnpm, Yarn and Bun consumer fixtures;
- add `LICENSE`, contribution and security policy after the project chooses its license.

Explicit installation of trusted packages already works. Automatic package discovery and a package
marketplace are not prerequisites for the first developer release.
The current release and restart boundary is documented in
[`open-source-distribution.md`](./open-source-distribution.md).

### A4. Trusted and untrusted extension levels

First make trusted local packages straightforward and diagnosable. Later add isolation for arbitrary
community Frontends, Producers and Validators:

- process or Wasm boundary;
- filesystem/network/environment permissions;
- CPU, memory, timeout and output limits;
- actual loaded-code digest verification;
- validator isolation or remote attestation.

### A5. Build archive inspection and egress — first CLI slice implemented

Make the already durable Build archive usable without confusing persistence with a destination
path:

- `inspect` lists target bindings, demanded Logical Outputs and every accepted Record;
- `get` reads any accepted Record or Build-referenced nested Artifact and optionally materializes
  its bytes or JSON;
- building without a path still archives the complete demanded closure;
- the Host-only Build Catalog powers `builds`, `inspect` presentation and `get --name` without
  entering Core identity or Runtime Closure;
- reachability-based orphan Artifact collection is explicit Runtime maintenance and dry-runs by
  default; Build release/retention windows remain deployment policy.

Add richer graph/plan views and structured diagnostics after this slice. The Catalog may
later support richer history search, but it must only help the user author explicit Candidates.
There is no automatic result reuse or hidden Candidate selection.

## B. Environment and Provider work

### B1. Repeatable live acceptance — manual path passed

One paid four-take generation Build plus one explicit Candidate-reuse Build covered the complete
combined path manually on 2026-08-07. Turn `examples/echo-pro-aroll` into a credential-safe opt-in
acceptance command that can also run a fresh uninterrupted all-`exact` Build:

- never commits credentials or paid output;
- verifies exact Endpoint coverage before spending money;
- runs the complete generation, media, alignment, planning and render path;
- proves a second Build can use explicit Existing-Value Candidates without another generation call.

### B2. Remote execution only where demanded

Local media, WhisperX and parallel HyperFrames execution are implemented. S3 Artifact streaming,
AWS media execution and the recoverable AWS HyperFrames Endpoint are also implemented. The exact
FFmpeg Layer plus ZIP-packaged media service have passed their complete five-operation live canary.
Complete the remaining deployment work only when a deployment needs it:

- deploy WhisperX only as a persistent warm service and add the corresponding remote-service
  Provider when a team environment needs it; do not put the model behind Lambda;
- deploy and live-test the HyperFrames stack after reviewing its CloudFormation resources.

The generic Lambda transport already exists. Each Endpoint must return the existing capability and
contract; Lambda placement cannot define another media meaning.

### B3. Production environment adapters

- Keychain, Secrets Manager or Vault CredentialStore;
- hosted Build/Operation stores and distributed leases only for a real multi-process deployment;
- Build release/retention windows and S3 lifecycle policy.

Authentication, tenants, credits, billing and dashboards belong to an embedding product such as
Hypit, not to open-source Core.

### B4. Additional Providers

KIE generation, Vertex Caption planning, local media, local OpenCV image transforms, local WhisperX
and local HyperFrames are implemented. Volcengine, Fal, API-key Gemini or Hypit can be added as
independent Endpoint packages. They do not require changes to author model packages or Core.

Since a Provider now contributes only a wire mapping over the input ports a model already declares
(see [`model-input-ports.md`](./model-input-ports.md)), onboarding the common aggregator services is
mostly data entry rather than code. The planned next phase is to bring the widely used relay
services into the repository in a batch, one package each, so that whichever service a user already
has an account with is simply available.

Ease of adoption comes first in that phase; a second optimisation pass follows once several
mappings exist side by side. Only then will it be clear which of these are real and worth building:

- shared enum and field-name vocabulary that repeats across relay services;
- generating a mapping skeleton from a service's published schema instead of hand-authoring it;
- one model reached through several services in one deployment, and how a Runtime Profile chooses;
- per-service pricing, rate limit and availability facts, which are deployment data and must not
  enter the port table.

Two rules hold through that phase. A relay service never edits a model package: if its documented
limits disagree with a port table, the disagreement is investigated against the model vendor rather
than absorbed into the mapping. And the port table keeps stating ports, cardinalities and
combination rules only — value-level compatibility matrices stay with the service to reject.

## C. Deferred video-domain work

Do not freeze or greatly expand the video author surface yet. The deferred backlog includes:

- full Text three-box and exact-font behavior;
- Caption field-to-word visual mapping plus browser/pixel acceptance;
- B-roll foreground/backdrop media-box behavior;
- Ranking and other old production components;
- final Track and renderer-neutral Visual IR compatibility freeze.

The current implementations remain executable vertical slices and regression witnesses while A and
B are completed.

## Explicit non-goals for the current phase

- no automatic cache or prompt-based semantic reuse;
- no Core `Pin` primitive;
- no Runtime guessing of creative method or model family;
- no universal queue package;
- no hosted multi-tenant platform required for local developer use;
- no cross-Track effect system or Base FX placeholder.
