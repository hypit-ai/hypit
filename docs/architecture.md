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
author source + author packages
             │
             ▼
        Author Graph                  Run source + run packages
   authored facts and defaults        values and alternate fragments
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

No external command is issued before the BuildPlan is frozen. Execution never chooses a Candidate,
changes graph topology or performs content-based common-subexpression elimination.

## 2. The irreducible Core

`@svml/protocol` defines immutable wire data and identity. `@svml/core` owns only:

- nominal type and schema verification;
- Author/Run Graph verification;
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

`.svml` is the official markup Frontend. `.svs` is the official reusable Recipe Frontend. Neither
syntax is built into Core, and another Frontend may produce the same typed Author Graph.

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

The `@svml/run` `.svrun` Frontend is the human-readable form of:

```text
Run Graph + Satisfaction[] + Target[]
```

It will not contain credentials, queue configuration or Runtime placement.

The two source graphs are compiled before execution:

```text
.svml  ──Frontend/Elaborator──> Author Graph
.svrun ──Run Frontend─────────> Run Graphs + Satisfaction edges + Targets
                                      │
                         deterministic graph composition
                                      │
                                finite BuildPlan
```

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

An author package selects an exact capability such as Seedance Mini or WhisperX. A Runtime Profile
binds that already explicit capability to one exact Endpoint instance. Runtime may select KIE versus
Volcengine for the same declared Seedance capability; it may not reinterpret a generic `speaker`
request as Seedance, Kling or another creative method.

## 7. Package and authority boundaries

A physical package may expose independently activated facets:

```text
static    Manifest and identity
author    Frontend, Surface and Graph Fragment
compute   deterministic Producer and Type Validator
endpoint  privileged external capability implementation
runtime   Scheduler and Store implementation
```

A source `<import>` activates only author meaning. It never grants network, filesystem, process,
credential or queue authority. Provider and Runtime facets are selected by the Host's locked Runtime
Profile.

The reference local Host accepts `svml.runtime.json`. It resolves exact adapter names through a
Host-owned `RuntimeConfigRegistry`, constructs package Manifests, locks the resulting Runtime
Profile/Closure, and only then installs Endpoints and services. The JSON contains non-secret
configuration and credential references; executable `svml.runtime.ts` remains an advanced host API.

Cross-package communication is decentralized. A type-owning module publishes a nominal `TypeRef`,
schema and optional semantic validator digest. Producers and consumers refer to that TypeRef. Core
does not maintain a registry of every domain type and does not require a release when a new package
is installed.

## 8. Reference host packages

The reusable domain-neutral stack is:

```text
@svml/protocol
@svml/core
@svml/elaborator          author declarations and hygienic Fragment expansion
@svml/host                Workspace contract
@svml/compiler-node       reference source/package compiler Host
@svml/runtime             Scheduler and Store ports
@svml/driver-node         trusted Node command executor
@svml/validation          semantic admission Host
@svml/local               SQLite/filesystem developer assembly
```

`@svml/text`, `@svml/script`, `@svml/svs`, video contracts and every Provider are optional domain or
application packages.

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
