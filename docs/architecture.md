# SVML architecture

Status: current v2 architecture, 2026-08-07. Wire formats mentioned here are executable `@2`
contracts, not sketches.

SVML has two deliberately separate ideas:

1. a domain-neutral system for compiling an authored graph plus explicit run choices into a
   finite, recoverable execution; and
2. an optional video language and package ecosystem built on that system.

The first can be reused by another domain without installing Script, Track, Film, WhisperX or
HyperFrames.

## 1. The complete flow

```text
Author Source + author packages
             │
             ▼
        Author Graph                  Run source + run packages
   authored facts and defaults        targets, values and alternate fragments
             │                                  │
             └──────────────┬───────────────────┘
                            │  Satisfaction edges + Targets
                            ▼
                     Build Compiler
                            │
                            ▼
                   immutable BuildPlan
                            │
                            ▼
        Build Scheduler → Driver → Endpoint/Producer
                            │
                            ▼
              Event → verified BuildState transition
```

Every v2 source starts with a mandatory self-description such as
`<?svml using="@svml/text@1"?>`. The suffix is only an editor and human convention; the Header
selects the exact trusted Frontend. There is no implicit Text, SVS or Run parser.

No external command is issued before the BuildPlan is frozen. Execution never chooses a Candidate,
changes graph topology or performs content-based common-subexpression elimination.

## 2. The irreducible Core

`@svml/protocol` defines immutable wire data and identity. `@svml/core` owns only:

- nominal type and schema verification;
- typed compiled-graph verification;
- explicit Satisfaction resolution;
- reverse reachability from arbitrary Targets;
- finite BuildPlan derivation;
- immutable Record, Need, Command, Event, Receipt and Derivation identity;
- monotonic `exact` / `substitute` propagation;
- deterministic state transitions and command regeneration on resume.

Core does not parse source, load packages, execute code, call Providers, read credentials, own a
queue, persist bytes or know any video type.

## 3. Author Graph

An Author Graph is the typed meaning produced from author source. Its public result identities are
`LogicalOutput`s. Each Logical Output declares:

- the nominal Type it promises;
- a Primary Candidate;
- the author-visible semantic inputs an implementation may depend on;
- optional declarative affinity constraints.

The Author Graph may contain authored Records, Candidates and Operations. A source Surface may hide
an arbitrary finite internal Fragment while still exporting a small, readable component interface.
That is ordinary static expansion, not a privileged macro path in Core.

`@svml/text` is the official markup Frontend normally used by `.svml`. `@svml/svs` is the official
reusable Recipe Frontend normally used by `.svs`. Neither suffix selects a parser, neither syntax is
built into Core, and another Frontend may produce the same typed Author Graph. A source-to-source
import names only a locator and alias; the imported source's own Header selects how it is read.

## 4. Run Graph and Satisfaction

A Run Graph uses the same typed Value/Operation/Fragment algebra to expose additional independent
Candidates. A Candidate has only:

```ts
type Candidate = {
  id: CandidateId;
  type: TypeRef;
  root: ProvidedValue | OperationResultRef;
};
```

It does not belong to a Logical Output and does not own fidelity. The connection is explicit:

```ts
type Satisfaction = {
  output: LogicalOutputId;
  candidate: CandidateId;
  fidelity: "exact" | "substitute";
};
```

One Candidate may satisfy several compatible Logical Outputs. One Run Fragment instance may export
several Candidates backed by one shared Operation. Two separately declared instances execute twice,
even when their package, parameters and content are identical.

Product UI words such as *pin*, *reuse*, *preview* and *black frame* are not Core variants. They are
ways to author a Run Graph and Satisfaction edges. A historical file is normally a zero-input
Provided-Value Candidate. A generated placeholder is normally an Operation Candidate.

`@svml/run` owns the syntax-neutral Run Graph model and compiler. The optional `@svml/run-text`
Frontend is the official human-readable form of one complete:

```text
Run Graph = Author Graph binding + Candidate/Operation graph
          + Satisfaction[] + named Target sets + selected Target set
```

It will not contain credentials, queue configuration or Runtime placement.

The two source graphs are compiled before execution:

```text
Author Source ──Frontend/Elaborator──> Author Graph
Run Source    ──Run Frontend─────────> one complete Run Graph
                                      │
                         deterministic graph composition
                                      │
                                finite BuildPlan
```

The Run Source names its Author Source explicitly. Both graphs are mandatory in the official build
path, even when the Run Graph selects only primary Candidates. Their digests are both bound into the
final compiled graph before planning; changing either source cannot silently resume the same Core
Build.

Run-only Fragment Producers extend the execution Program Closure without entering Author imports or
changing the Author Graph. The final Build identity binds that closure digest in addition to both
graph identities.

Named target sets make a useful stopping point reusable. `<value>` and `<build-record>` declare
zero-input Candidates. Imported trusted Run Fragments declare Operation-backed Candidates; several
exports from one Fragment declaration share one instance, while separate declarations remain
separate executions.

## 5. Multi-result components

The system separates five identities:

```text
Component → Logical Output → Fragment export → atomic Operation Product → Record
```

One Operation produces one atomic Product. A Product may contain several related facts, followed by
cheap deterministic Projection Operations:

```text
GenerateSpeechTake → SpeechTake Product
                         ├─ ProjectVisual → VisualTrack
                         └─ ProjectAudio  → AudioTrack
```

This permits all of the following without a special replacement rule:

- one alternate Product satisfies both outputs through shared projections;
- two alternate instances separately satisfy the two outputs and execute twice;
- one output is substituted while a demanded sibling keeps the default Product reachable;
- all demanded default projections are substituted, so the default Product becomes unreachable.

Pruning follows graph reachability only. A Product records common origin; it does not impose a
`mustReplaceTogether` policy.

## 6. Runtime and external capabilities

The Runtime executes an already frozen plan. Its environment-neutral ports are:

| Port | Responsibility |
|---|---|
| `BuildScheduler` | readiness, concurrency lanes, fairness, retry and cancellation policy |
| `BuildStore` | verified BuildState snapshots and compare-and-swap revisions |
| `OperationStore` | external submission identity, checkpoint, reconciliation and completion |
| `ArtifactStore` | content-addressed bytes |
| `CredentialStore` | scoped secret lookup for an exact Endpoint instance |
| `CommandDispatcher` | optional distributed delivery after scheduling authority has decided |

There is no universal Queue package. One Build has one authoritative Scheduler. KIE, Lambda and
other remote services may have private job queues, but those queues cannot advance the SVML graph.

`BuildCatalog` is intentionally absent from this table. It is an optional Host presentation index
from a user-facing Build id to Core identity, source/run provenance and source output aliases. It is
not an execution service, does not enter Runtime Closure, and can never satisfy or schedule graph
work. Alias reads are revalidated against the authoritative BuildState.

Targets determine demand only. Every accepted output in the demanded closure is a durable Record,
not only the target results. BuildStore archives structured facts and provenance, OperationStore
archives recoverable external attempts, and ArtifactStore archives content-addressed bytes. Values
inside one Producer invocation remain ephemeral unless the package exposes them through a typed
output. This structural boundary avoids a Core list of "important intermediates."

A destination path is optional Host egress after archival. Omitting it never discards a Render,
WhisperX result or another accepted Record. Convenience copying, retention and garbage collection
are Runtime/Host policy and do not enter author or Run graph identity. See
[`build-archive-and-egress-v1.md`](./build-archive-and-egress-v1.md).

An author package selects an exact capability such as Seedance Mini or WhisperX. A Runtime Profile
binds that already explicit capability to one exact Endpoint instance. Runtime may select KIE versus
Volcengine for the same declared Seedance capability; it may not reinterpret a generic `speaker`
request as Seedance, Kling or another creative method.

## 7. Package and authority boundaries

A physical package may expose independently activated facets:

```text
static    Manifest and identity
author    Frontend, Host-specific Surface facet and Graph Fragment
compute   deterministic Producer and Type Validator
endpoint  privileged external capability implementation
runtime   Scheduler and Store implementation
```

After byte-lock verification, the Loader returns a `NodePackageContribution`: a description of
what that physical package offers. It is not an authority token. A compiler or Runtime installs
only the exact facet ABIs it has explicitly selected.

A source `<import>` activates only author meaning. It never grants network, filesystem, process,
credential or queue authority. Provider and Runtime facets are selected by the Host's locked Runtime
Profile.

Run Frontends are locked by id and implementation digest just like Author Frontends. Trusted Run
Fragments use the `svml.run-fragment-host@1` facet ABI: the generic Package Loader locks the opaque
identity, and only the Run Host validates and installs its Fragment exports. The Loader has no
special `runFragments` branch and does not interpret Run syntax.

The reference local Host accepts `svml.runtime.json`. It resolves exact adapter names through a
Host-owned `RuntimeConfigRegistry`, constructs package Manifests, locks the resulting Runtime
Profile/Closure, and only then installs Endpoints and services. The JSON contains non-secret
configuration and credential references; executable `svml.runtime.ts` remains an advanced host API.

Cross-package communication is decentralized. A type-owning module publishes a nominal `TypeRef`,
schema and optional semantic validator digest. Producers and consumers refer to that TypeRef. Core
does not maintain a registry of every domain type and does not require a release when a new package
is installed.

The public nouns are intentionally narrow:

| Name | Means | Does not mean |
|---|---|---|
| Module | logical versioned owner of Types, Producers and Surfaces | npm package or running code |
| Package | physical install/release unit | automatic authority |
| Contribution | passive inventory returned by a locked package entry | installed or executable permission |
| Facet | one ABI-selected executable contribution | whole-package activation |
| Host | process/application that selects and installs facets | Core |
| Compiler | source-to-frozen-graph/plan assembly | Provider execution |
| Distribution | trusted application choice of compiler, built-ins and config adapters | wire contract |
| Runtime | execution services for an already frozen BuildPlan | author-language interpreter |
| Endpoint | one configured implementation of an exact Capability | model-routing guess |
| Provider package | Endpoint implementations for one external service boundary | semantic component |
| Prelude | curated built-in author package contribution | mandatory Core vocabulary |

These terms also drive physical names: `compiler-text-node` selects Text compilation,
`package-loader-node` locks and loads physical Node packages, `video-cli` is a video Distribution,
and `provider-kie` implements KIE Endpoints. A new package should not use one noun while owning the
authority of another.

## 8. Reference host packages

The reusable domain-neutral stack is:

```text
@svml/protocol
@svml/artifact            domain-neutral nominal type for content-addressed bytes
@svml/core
@svml/source              mandatory self-describing Source Header; no syntax default
@svml/elaborator          author declarations and hygienic Fragment expansion
@svml/run                 syntax-neutral Run Source closure and complete Run Graph compiler
@svml/host                Host-facing interfaces and generic facet envelope
@svml/compiler-node       reference source/package compiler Host
@svml/package-loader-node locked physical-package loading; no syntax selection
@svml/runtime             Scheduler and Store ports
@svml/driver-node         trusted Node command executor
@svml/validation          semantic admission Host
@svml/local               SQLite/filesystem developer assembly
@svml/cli                 generic command engine; requires an explicit Distribution
```

`@svml/run-text`, `@svml/text`, `@svml/script`, `@svml/svs`, video contracts and every Provider are
optional language, domain or application packages.

`@svml/compiler-text-node` is the optional reference assembly that selects the official Text entry
Frontend and installs only `svml.text-surface-host@1` Host facets. The same locked physical package
may carry deterministic compute facets into `@svml/local` without either the Loader or Runtime
depending on Text. Other Host-facet ABIs remain inert until another explicit Host selects them.

`@svml/video-cli` is the optional video Distribution. It supplies the generic CLI with the Text
compiler assembly, the explicit Run Text Frontend, built-in video package contributions and the
video Runtime-config adapter registry. Thus neither `@svml/cli` nor `@svml/local` names a video
package or Provider.

The exact bootstrap and data gates are specified in
[`source-and-run-compilation-v1.md`](./source-and-run-compilation-v1.md).

## 9. Trust boundary

The current loader supports explicitly installed, byte-locked, trusted packages. It does not claim
that arbitrary community Parser, Producer or Validator code is safe. Untrusted packages require a
real process/Wasm isolation boundary, permission grants, resource limits and code-byte verification.

Package installation is also outside source semantics: importing a module never authorizes npm
installation or execution.

## 10. Video is an ordinary distribution

The official video packages contribute Narrative, ProgramSpace, Speech, SemanticMap, Track and
Composition contracts plus author Surfaces. They use the same Graph, Candidate, Satisfaction, Need
and Endpoint rules as any other domain. Film is an ordinary Composition target; HyperFrames is an
ordinary downstream implementation; neither is a Core root.

The current audiovisual narrow waist remains pre-freeze. Its expressiveness work is intentionally
deferred while the domain-neutral run language and deployment paths are completed.

See [`open-source-distribution.md`](./open-source-distribution.md) for independent publication,
restart and current release-readiness boundaries.
