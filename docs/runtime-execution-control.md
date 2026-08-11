# Runtime execution, dispatch and cancellation

Status: local durable slice implemented, 2026-08-11. This document records the execution laws and
their extension boundary; it does not change Core, Author Graph or Run Graph semantics.

## 1. Outcome

A Build command should be cheap and asynchronous without making execution opaque:

```text
Author + Run sources
        │ compile and freeze; no external call
        ▼
verified Build + staged source Artifacts
        │ durable, idempotent dispatch
        ▼
Build Dispatch Store ◀──── operator control requests
        │ lease
        ▼
Worker → Core readiness → Scheduler admission → Driver → Endpoint
  │                                              │
  └── durable execution journal                  └── Provider-owned remote job
```

The desired local experience is:

```bash
narratage runtime up ./svml.runtime.json
narratage build ./build.svrun --runtime ./svml.runtime.json
narratage queue --runtime ./svml.runtime.json --watch
```

`build` returns after the Build is durably archived and dispatched. `--follow` is only an observer;
closing that terminal must not stop the Build. A selected managed-local Worker may be started
idempotently by `build`, just as `runtime up` would. A remotely managed Runtime reports its control
endpoint instead of pretending the CLI owns that process.

The design has five hard boundaries:

1. Core remains a pure, domain-neutral state machine and never owns a queue, Worker or cancellation
   policy.
2. A dispatch queue stores Build identities and scheduling facts, never serialized Core Commands.
3. Runtime control cannot choose another Candidate, Provider method or graph topology.
4. Provider-internal queues remain private to that Endpoint and never become Build truth.
5. Cancellation never deletes accepted Records, Operation history or Artifact bytes.

## 2. The facts are deliberately separate

One word such as *job* currently hides several different facts. The execution system must retain
their separate authorities:

| Fact | Authority | Meaning |
|---|---|---|
| frozen graph and BuildPlan | compiler + Core | what this Build is allowed to do |
| verified BuildState | BuildStore + Core | which Events have been accepted |
| dispatch ticket | BuildDispatchStore | whether a Worker should continue advancing the Build |
| Operation attempt | OperationStore | one exact external submission, checkpoint and result |
| Artifact | ArtifactStore | content-addressed bytes |
| runtime journal | execution Runtime | leases, admission, control requests and observations |
| remote job | exact Endpoint/Provider | vendor- or deployment-specific work |

No row is a cache. No row may silently satisfy a Logical Output. Historical results participate in
a later Build only through an explicit Run Candidate and Satisfaction edge.

The Runtime journal is operational evidence, not video or domain data. It must not be copied into
Records, media values or other graph edges. The BuildState remains valid without it; the journal
exists so humans and Workers can explain and control execution.

## 3. One Runtime Profile defines one execution domain

An execution domain is the authority selected by one resolved Runtime Profile closure:

```text
execution domain
├── BuildStore
├── OperationStore
├── ArtifactStore
├── BuildDispatchStore
├── RuntimeJournal
├── Scheduler policy and lane capacities
├── Worker population
├── Endpoint instances
└── managed tools and daemons
```

All Workers in one domain share the same dispatch, leases and capacity counters. Two independent
profiles may intentionally form two independent domains. A local project normally has one domain;
a hosted deployment may back the same ports with Postgres, S3 and several Workers.

Installing a component or Provider does not create a database table. Dispatch and journal schemas
contain only opaque framework identities. A new package contributes Types, Producers, Endpoints or
Runtime adapters through existing facets and does not require a Core or Store schema release.

### 3.1 Why the public parent command is `runtime`

The complete managed object is larger than a set of services. It includes stores, queue state,
Workers, capacity, short-lived tools, long-lived daemons and remote dependencies. Therefore the
public aggregate is `runtime`:

```bash
narratage runtime up      ./svml.runtime.json
narratage runtime status  ./svml.runtime.json
narratage runtime logs    ./svml.runtime.json
narratage runtime down    ./svml.runtime.json
```

The current expert command for actual external programs remains deliberately narrow:

```bash
narratage services up|status|down ./svml.runtime.json
```

It never names an in-process Store or starts the Worker. The model separates:

| Runtime dependency | Lifecycle | Examples |
|---|---|---|
| in-process resource | construct/close with Worker | Scheduler, Store clients, Endpoint clients |
| prepared tool | prepare/probe; no daemon PID | FFmpeg, OpenCV environment, HyperFrames browser |
| managed daemon | start/stop/status/logs | Worker, warm local WhisperX |
| operator-owned daemon | probe only | a team-hosted WhisperX service |
| remote dependency | read-only diagnostic only | KIE, Vertex, MiMo, S3, AWS APIs |
| provisioned infrastructure | explicit deploy command | Lambda stacks, buckets, IAM roles |

`runtime up` may prepare selected local tools, probe dependencies, start selected managed daemons
and start the Worker last. It must never create cloud infrastructure, mutate IAM, log in to a
Provider or deploy Lambda. Those are explicit provisioning operations.

The detached process record binds the canonical Profile path and an effective revision covering
the Profile bytes plus both package locks it names. If the Profile or either lock changes while a
Worker is alive, `runtime status` reports `stale`; the next `runtime up` or `build` stops that
process and starts one from the new closure instead of silently executing new dispatches under old
configuration.

`doctor` remains read-only. It validates the profile, locks, credentials and prerequisites. A
healthy remote credential and a currently running local daemon are different diagnostics; liveness
belongs to `runtime status`.

## 4. Build dispatch is not a command queue

Core is the only authority that derives ready Commands. Persisting a serialized ready Command would
create a second, tamperable source of truth. The durable dispatch unit is therefore one Build
ticket, conceptually:

```ts
type BuildDispatch = {
  build: string;
  core: Digest;
  runtimeClosure: Digest;
  priority: number;
  availableAt: number;
  admission: "open" | "closing" | "closed";
  lease?: {
    owner: string;
    token: string;
    expiresAt: number;
  };
  terminal?: "complete" | "failed" | "cancelled";
};
```

The `svml.build-dispatch@1` wire schema implements these laws:

- dispatch is idempotent by Build identity;
- the ticket binds the same Core Build and Runtime Closure as the archived Build;
- a Worker must acquire a fenced lease before advancing it;
- a stale lease can be reclaimed after its heartbeat expires;
- a Worker always reopens verified BuildState and asks Core for current readiness;
- pending Operation checkpoints remain in OperationStore, not in the ticket;
- `availableAt` is a wake hint, not evidence that a Command is ready;
- completing or cancelling a ticket never removes BuildState, Operations or Artifacts.

The local implementation belongs beside the current SQLite Store and may share one transaction
boundary with it. A hosted adapter can implement the same port with Postgres. Redis, SQS or a vendor
queue may be a notification transport, but it cannot replace the authoritative ticket and lease.

### 4.1 Worker loop

One Worker repeatedly:

1. claims an available Build ticket with a fenced lease;
2. reopens and verifies BuildState, Runtime Closure and active Operations;
3. observes durable control requests before admitting any new work;
4. asks Core/Driver to regenerate runnable Commands;
5. fairly admits Commands under domain-wide capacity;
6. commits Operation checkpoints and accepted Core Events before proceeding;
7. requeues the Build at its earliest `wakeAt`, marks it blocked, or closes it terminally;
8. heartbeats while it owns local or remote in-flight work.

More Workers improve throughput; they do not create new execution truth. Fencing prevents a stale
Worker from committing after another Worker has reclaimed its Build.

### 4.2 Capacity has two meanings

A single `maxConcurrency` is insufficient for recoverable remote work. Runtime scheduling must
distinguish:

- **active capacity**: calls currently consuming a local Worker/process/HTTP admission slot;
- **in-flight capacity**: remote jobs already submitted but still pending;
- **submission rate**: Endpoint/provider-specific request-rate policy.

For example, a generation lane with `active = 2` and `inFlight = 2` may poll cheaply while keeping
at most two paid remote generations outstanding. A media lane may need only active capacity because
its process ends with the admitted call. Provider rate limiting remains Endpoint policy; it is not
creative graph selection.

Capacity is shared by every Build and Worker in one execution domain through DispatchStore. Separate
CLI processes do not receive private copies of the limit.

## 5. Build submission and observation

The implemented `build` sequence is ordered to keep failures free and deterministic for as long as
possible:

1. read Headers and lock-selected Frontends;
2. compile Author and Run sources;
3. project the exact Target execution slice, then freeze and verify its finite BuildPlan;
4. validate Runtime coverage from pure Endpoint activations without executing any handler;
5. stage source Artifacts;
6. idempotently create BuildState and Host Catalog presentation data;
7. create or reopen the Build dispatch ticket;
8. ask the selected Runtime controller to ensure a managed Worker is ready;
9. return the Build id and current dispatch state.

No Provider call, model load or daemon start occurs before steps 1–4 succeed.

`--follow` observes lightweight Dispatch and Operation activity after submission, then reads the
complete verified BuildState once at terminal presentation. It does not repeatedly deserialize the
entire immutable Program while waiting. `Ctrl-C` only detaches that observer. It is never shorthand
for Build cancellation or Runtime shutdown.

The Runtime Profile must explicitly select how Worker lifecycle is controlled. A managed-local
controller may spawn or wake the local Worker. An externally managed deployment may only verify
that its Worker population is reachable. There is no hidden global daemon and no hard-coded hosted
service.

## 6. Transparent inspection

The CLI should expose the same durable facts an operator would inspect in a hosted dashboard:

```bash
narratage runtime status ./svml.runtime.json
narratage queue --runtime ./svml.runtime.json
narratage queue --runtime ./svml.runtime.json --watch
narratage status <build-id> --runtime ./svml.runtime.json
narratage inspect <build-id> --runtime ./svml.runtime.json
narratage operations <build-id> --runtime ./svml.runtime.json
narratage operation <operation-id> --runtime ./svml.runtime.json
```

The resource names may be refined with the CLI, but the information boundary is fixed:

### Runtime status

- Runtime Closure and execution-domain identity;
- Worker identity, lease heartbeat and version;
- queued, leased, waiting, blocked and settling Build counts;
- global, lane active and lane in-flight capacity;
- prepared tool and daemon state;
- remote dependency diagnostics without secrets.

### Build status

- selected Targets and demanded branches;
- explicit Satisfaction/Candidate substitutions;
- dispatch phase, admission state and lease owner;
- current ready, active, pending, blocked and suppressed Commands;
- accepted Records and terminal Core status;
- outstanding cancellation requests.

### Operation status

- exact Build, Core Command, Need, Endpoint instance and implementation identity;
- attempt number, submission key and request digest;
- lane, opaque recovery checkpoint, remote task identity and next wake time;
- optional generic progress `{ phase, completed?, total?, unit? }`, persisted on every pending
  revision and supplied only by the Endpoint from measured Provider facts;
- execution outcome and cancellation control state;
- completion Artifact references or failure;
- whether a completion has been accepted into Core.

Provider metadata is visible only after secret redaction. Logs and journal entries must never print
credential values.

Progress is deliberately not decoded from a checkpoint by the CLI. Checkpoints belong to one
Endpoint implementation and exist for recovery; progress is a small cross-Endpoint observation
contract. An Endpoint with no measured total reports only a phase, never a fabricated percentage.

The full TTY/plain/JSON rendering, watch screens, diagnostic format and confirmation language are
specified in [`cli-experience.md`](./cli-experience.md).

## 7. Cancellation is a protocol, not a status assignment

Cancellation has four independent questions:

1. **Was cancellation requested?** The operator's intent is durably recorded.
2. **Was new downstream admission closed?** No new work in the selected scope may start.
3. **Did the Endpoint accept or confirm a stop?** This is Provider-specific control evidence.
4. **What factually happened to the work?** It may stop, fail, or complete too late.

Only a confirmed stop may produce the terminal Operation state `cancelled`. Writing `CANCELLED`
immediately after sending one API request is false whenever the Provider merely accepted the
request, does not support cancellation, or raced with completion. Confirmation says nothing about
refunds or billing; those remain Provider facts.

### 7.1 The two state axes

An Operation keeps its factual execution state separate from its cancellation control record.

Execution state is one of:

```text
created     no external terminal fact has been recorded yet
pending     the exact attempt exists and requires reconciliation
completed   a validated result exists
failed      a factual execution failure exists
cancelled   the exact work is confirmed stopped
```

`created` may move directly to any terminal state; `pending` may move to any terminal state.
Terminal states never overwrite one another.

Cancellation control:

```ts
type CancellationControl = {
  requestedAt: number;
  requestId: string;             // makes repeated requests idempotent
  status: "requested" | "accepted" | "confirmed" | "unsupported" | "too-late";
  attempts: number;
  retryAt?: number;
  lastError?: RedactedError;
};
```

A transport error does not invent a new semantic outcome. The control remains `requested`, records
the redacted error and retries according to a finite control policy. Typical combinations are:

| Execution | Cancellation | Meaning |
|---|---|---|
| `pending` | `requested` | durable request exists; Worker has not established Provider outcome |
| `pending` | `accepted` | Provider received the request; stopping is not yet confirmed |
| `pending` | `unsupported` | Runtime will not start downstream work, but remote work may continue and bill |
| `cancelled` | `confirmed` | Provider or local process confirmed that work stopped |
| `completed` | `too-late` | completion won the race |
| `completed` | `unsupported` | uncancellable work finished after its branch was suppressed |

This control record belongs to OperationStore/runtime execution state. It never enters a domain
Record or changes the author graph.

### 7.2 Endpoint cancellation contract

The current optional `cancel(): void` contract is too weak. The target recoverable Endpoint
contract returns one of:

```ts
type EndpointCancelOutcome =
  | { status: "confirmed" }
  | { status: "accepted"; checkpoint: CanonicalValue; wakeAt?: number }
  | { status: "unsupported" }
  | { status: "too-late" };
```

- `confirmed`: the Endpoint can establish that the exact submitted work will not complete.
- `accepted`: a stop request was accepted; `resume`/reconciliation must continue until factual
  terminal state is known.
- `unsupported`: this exact Endpoint cannot stop the work. Reconciliation continues.
- `too-late`: the Endpoint establishes that the work was already terminal.

Omitting `cancel` is equivalent to `unsupported`. Endpoint Manifests should advertise whether they
support cooperative local abort or recoverable remote cancellation so the UI can warn before a
Build starts; the returned outcome remains authoritative.

Immediate local implementations receive an `AbortSignal`. Process-based implementations must own
and terminate the exact process group they started, then wait for exit before confirming. A fast
pure Producer may complete before observing the signal; that is `too-late`, not cancellation.

### 7.3 Cancelling one Operation

Operation cancellation addresses one exact Operation id, therefore one exact Build, Command,
Endpoint implementation, request digest, attempt and submission key.

Its semantics are:

1. atomically record the cancellation request on that Operation;
2. suppress any new attempt for the same Core Command in this Build;
3. do not admit downstream Commands that require its missing fulfillment;
4. continue unrelated reachable branches of the same Build;
5. ask the exact Endpoint to cancel and reconcile until factual terminal state is known;
6. never select another Candidate or Endpoint as a fallback.

The branch may therefore remain intentionally unsatisfied. If the user wants Kling, a black frame,
a historical file or another implementation instead, that choice belongs in another explicit Run
Graph/Satisfaction selection and normally creates another Build identity. Runtime cancellation is
not graph recompilation.

Cancelling one Operation is an advanced, potentially branch-stranding action. The CLI must show the
dependent Targets/Commands before confirmation unless an explicit non-interactive flag is supplied.

### 7.4 Cancelling a Build

Build cancellation is broader:

1. durably request `admission = closing` on its dispatch ticket;
2. the lease-owning Worker acknowledges the boundary and changes it to `closed`;
3. after that boundary, no new Command in the Build may be admitted;
4. cancellation is requested for every active Operation, recording `unsupported` where no hook
   exists;
5. pending Operations remain visible and are reconciled even when cancellation is unsupported;
6. accepted Core Records and all Artifact bytes are retained;
7. the dispatch ticket becomes terminal `cancelled` only after every active Operation is factually
   terminal or confirmed stopped.

Until then the honest Build presentation is `cancelling`, with counts such as “two confirmed, one
remote job still running, one unsupported.” A queued, unleased Build with no Operation can close
immediately without any Provider call.

The Core BuildState need not fabricate a domain failure merely because execution admission was
closed. The dispatch ticket records the cancelled realization; the archived Core state remains the
last verified semantic state. This preserves the distinction between “the graph is invalid” and
“the operator stopped this execution.”

### 7.5 Late results

An Operation may complete after its Command or Build was suppressed. The Runtime must:

- journal and validate the factual Operation completion;
- retain referenced Artifacts so paid work is not silently lost;
- not reduce its fulfillment Event into the suppressed Build branch;
- expose the result as “completed after cancellation; not accepted by Core”;
- allow a later Run Source to reference it explicitly as a zero-input Candidate if desired.

Artifact garbage collection already has to consider retained Operations as roots. Cancellation
does not add a special media or domain retention rule.

### 7.6 Race rules

| Race | Required result |
|---|---|
| cancel before Build claim | close ticket immediately; zero Endpoint calls |
| cancel after claim but before admission | Worker observes control first and suppresses Command |
| cancel concurrent with first submission | stable Operation identity and CAS decide; reconcile the same submission key, never submit a replacement to “check” |
| cancel while remote pending | call exact Endpoint cancel; record `accepted`, `confirmed`, `unsupported` or `too-late` |
| completion wins Operation CAS | completion remains factual; cancellation is `too-late` |
| cancellation request wins CAS | later completion is archived but not reduced into the suppressed branch |
| Worker crashes during cancellation | durable request and lease expiry let another Worker continue; no new submission key |
| repeated cancel commands | same request is idempotent; no duplicate Provider cancellation call beyond retry policy |
| cancel after terminal completion/failure | report `too-late`; never rewrite terminal history |

For Build-wide cancellation, the Worker acknowledgment of `admission = closed` is the execution
linearization point. `cancel requested` is visible before that acknowledgment; the CLI must not
claim that admission is already closed.

## 8. Things that are not cancellation

| Action | Meaning |
|---|---|
| detach `--follow` / press Ctrl-C | stop observing only |
| `runtime down` | stop this Runtime Worker from claiming more dispatch leases and stop owned programs; preserve Builds for later recovery |
| stop/restart WhisperX | manage one daemon; do not rewrite Build intent |
| remove a queued notification | not allowed as a substitute for closing the authoritative dispatch ticket |
| Provider timeout | factual Operation failure or pending uncertainty, not operator cancellation |
| choose a substitute Candidate | compile a different explicit Run realization, not cancellation |
| release a Build or run Artifact GC | retention policy after execution, not cancellation |

`runtime down` should be graceful by default: stop accepting new leases, let bounded local work
drain, checkpoint remote pending Operations, release leases and then stop owned daemons. It never
sends Provider cancellation requests. A forced shutdown is crash semantics and must be described as
such; it is still not a creative or cancellation decision.

## 9. Implemented local slices

The local reference implementation contains:

1. add an environment-neutral `BuildDispatchStore`/lease port and Runtime journal vocabulary;
2. implement the local durable ticket, lease and journal in SQLite;
3. extract the current scheduling loop into a domain-neutral Worker executable;
4. split CLI submission from Worker execution; make `--follow` read-only;
5. add active and in-flight capacity accounting shared across Workers;
6. replace `cancel(): void` with explicit Endpoint cancellation outcomes and cooperative abort;
7. implement Operation- and Build-scope suppression, reconciliation and race tests;
8. split tools, managed daemons and remote diagnostics beneath `runtime` lifecycle commands;
9. make `doctor` purely read-only and stop auto-starting services before source validation.

The first vertical slice uses explicit SQLite, filesystem ArtifactStore and current local
Providers. Hosted queues, billing, multi-tenancy and cloud deployment remain separate adapters or
embedding-product concerns.

## 10. Acceptance laws

The execution redesign is not complete until tests prove all of these:

- two CLI submissions share one configured lane limit through the same local Worker;
- closing the submitting terminal does not pause the Build;
- a Worker crash after remote submission resumes the same Operation and submission key;
- no serialized queued Command can be tampered with because none is stored;
- cancelling an unclaimed Build makes zero Endpoint calls;
- an unsupported remote cancellation stays visible and continues reconciliation;
- a completion/cancel race is resolved by CAS without overwriting factual completion;
- a late paid Artifact is retained but not accepted into a suppressed branch;
- cancelling one branch leaves unrelated targets runnable;
- cancellation never selects an alternate Candidate;
- `runtime down` performs no Provider cancellation;
- every status and log view redacts credentials;
- installing a new component or Provider requires no Core change and no component-specific Store
  migration.
