# Provider authorities, routes and durable execution

Status: implementation contract, 2026-08-11.

This document defines how one execution domain schedules expensive or recoverable work. It is
domain-neutral: KIE and Seedance are examples, not Runtime concepts. Nothing here changes the
Author Graph, Run Graph, Candidate selection or Core state machine.

The first implementation slice now provides exact-revision dispatch claims, atomic multi-resource
capacity, explicit Endpoint Authorities, exact capability Routes in Operation identity, durable
blocked tickets, and CLI grouping derived from those tickets. Historical-revision retention and
supervision, Authority lifecycle controls, and priority/`availableAt` ordering between Operation
tickets remain follow-up slices. Until then, a missing historical revision stays unclaimed; it is
never rerouted through the current Profile.

## 1. The four identities

Four identities that were previously compressed into an Endpoint name or a `lane` must remain
separate:

| Identity | Example | Authority |
|---|---|---|
| Provider Authority | `kie.main` | one account, deployment or compute pool sharing limits |
| Capability Route | `@narratage/seedance-2-mini@1#GenerateVideo` | the exact capability requested by the graph |
| Runtime Revision | a resolved Runtime Closure digest | the exact code, configuration and package closure that can resume work |
| Operation Ticket | one Build plus one regenerated Core Command | one durable request for execution admission |

An Authority id is explicit, stable and non-secret. It must not be derived from an API key. Two
Endpoint instances using the same Provider account use the same Authority id; two accounts use
different ids even when they come from the same package.

A Route is derived from the exact capability already present in the Need. Installing a new model
therefore adds no Core, CLI or Store enum. A non-model Endpoint still has a Route; only the human UI
may label this level “Model” when the package describes it that way.

The Runtime Revision is immutable for a Build. Changing the current Runtime Profile affects later
Builds only. An unfinished Build is never silently moved to another Provider or another
implementation revision.

## 2. One physical ticket store, two logical queue levels

The execution domain has one authoritative durable ticket store. It does not create a physical
queue per model or Provider. Each external Operation Ticket carries generic resource claims:

```text
Ticket(build, command, runtime revision)
  claims authority:kie.main
  claims route:kie.main/@narratage/seedance-2-mini@1#GenerateVideo
```

Admission acquires every claim atomically. It never acquires the parent and then waits while
holding it for the child. This prevents partial reservations, deadlocks and duplicate execution.

The CLI groups the same tickets as:

```text
kie.main
└── Seedance 2 Mini       queued 3 · active 2 · remote 2/2
```

This is a view, not another scheduler or registry.

Each resource may constrain two independent quantities:

- active: local calls currently executing;
- in-flight: submitted recoverable work without a terminal Provider fact.

Provider submission rate is a third, Provider-owned policy. A request-per-window gate cannot be
represented as concurrency, and it remains inside the exact Provider implementation. For example,
an account may allow twenty submissions per ten seconds while the Runtime independently limits two
Seedance generations in flight.

The first scheduler ordering is deliberately small and deterministic: higher Build priority,
earlier `availableAt`, then earlier ticket creation. More elaborate fairness may replace this
policy without changing tickets, graph meaning or Core.

## 3. Tickets store identities, never executable requests

An Operation Ticket contains only facts needed for safe admission and observation:

```ts
type OperationTicket = {
  build: string;
  command: string;
  runtimeRevision: Digest;
  authority: string;
  route: string;
  priority: number;
  availableAt: number;
  resources: ResourceClaim[];
};
```

It does not store a serialized Core Command, Need, prompt, credential or Provider request. Before a
side effect, the Worker reopens verified BuildState, asks Core/Driver to regenerate the Command and
checks that the regenerated Runtime Revision, Authority, Route and resource claims equal the
ticket. OperationStore continues to own submission keys and opaque Provider checkpoints after
external submission.

Deterministic Producers may use the same admission mechanism with ordinary resource claims, but
they do not pretend to have a Provider Authority. New component packages remain installable without
Store migrations.

## 4. Runtime revision-safe Workers

A Worker declares exactly which Runtime Revision it can execute. Dispatch claiming is filtered by
that revision inside the Store transaction. A Worker must never claim a foreign Build and discover
the mismatch afterward.

`runtime up` supervises an execution domain, not just the current Profile process:

1. resolve and retain the current Runtime Revision for new Build submissions;
2. inspect unfinished dispatches and tickets;
3. start the current revision;
4. start only historical revisions still needed by unfinished work, in drain-only mode;
5. leave unused historical revisions stopped.

The retained revision record contains non-secret resolved configuration, package lock identities
and implementation locators. Credentials remain in CredentialStore. If the package bytes for an
old revision are unavailable, its work becomes `blocked: missing-runtime-revision`; it never falls
through to the current Provider.

## 5. Authority lifecycle

An Authority has an operational lifecycle independent from package installation:

| State | New Builds | Existing frozen Builds | Worker |
|---|---|---|---|
| `open` | accepted | progresses | may run |
| `draining` | rejected | may create remaining downstream Operations and finish | runs drain-only |
| `suspended` | rejected | retained without progress | stopped |
| `retired` | rejected | none may remain | absent |

Lowering a capacity below the current in-flight count never cancels work. It prevents new admission
until usage falls below the new limit.

Switching the current binding from KIE to Fal marks the KIE Authority `draining` and Fal `open`.
Old KIE Builds continue under their frozen revision; new Builds use Fal. Returning to the same KIE
account reopens the same Authority and reuses its queue, rate and history. A different KIE account
requires a different Authority id.

Changing Provider code while keeping the same account creates a new Runtime Revision under the
same Authority. Old and new revisions execute separately but share the Authority and Route
capacities because the external account limits are shared.

Moving unfinished creative work to another Provider is not a queue action. It requires a new Build
with the new Run realization; completed old Records may be selected explicitly as Candidates.

## 6. Deployment and multi-process law

One local project may keep the ticket store, BuildStore, OperationStore and Workers in one SQLite
execution domain. Several processes or machines share account-wide limits only when they share the
same authoritative dispatch/capacity store. Two independent SQLite files cannot honestly enforce
one KIE account limit.

The Build coordinator and Endpoint executor are logically distinct:

```text
Build coordinator                       Endpoint executor
Core readiness ──> Operation Ticket ──> atomic resource admission ──> Driver/Endpoint
```

They may run in one local Node process initially. A hosted adapter may split them across processes
without changing Core or graph contracts.

## 7. Runtime Profile boundary

The deployment explicitly gives each Endpoint instance an Authority id. Provider packages declare
their exact Routes through capabilities and contribute default resource limits. A Runtime Profile
may override limits by opaque resource id, but it does not define model semantics.

There is no implicit `generation` queue, global Provider list or model registry. `kie.main` is not a
reserved name; it is deployment data. Seedance is not a Runtime enum; it is an installed capability
package selected by the graph and bound by the Runtime Profile.

## 8. Acceptance laws

The implementation is complete only when tests establish all of these:

- a Worker cannot claim a Build from another Runtime Revision;
- one Ticket atomically consumes both Authority and Route capacity;
- two models share one Authority limit while retaining independent Route limits;
- the same model on KIE and Fal has independent Authority/Route queues;
- changing the current Profile never reroutes an unfinished Build;
- changing code revision for one account shares external capacity but uses the exact old code to
  resume old Operations;
- lowering limits does not cancel in-flight work;
- a missing historical revision blocks visibly without causing a Provider call;
- queue inspection derives Provider-to-Route grouping from tickets, not a central registry;
- no ticket contains a serialized Command, Need, request body or credential;
- installing a new Provider or model requires no Core, CLI or Store schema change.
