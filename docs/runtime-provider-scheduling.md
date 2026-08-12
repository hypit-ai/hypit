# Provider authorities, routes and durable execution

Status: implementation contract, 2026-08-11.

This document defines how one execution domain schedules expensive or recoverable work. It is
domain-neutral: KIE and Seedance are examples, not Runtime concepts. Nothing here changes the
Author Graph, Run Graph, Candidate selection or Core state machine.

The implementation provides exact-revision dispatch claims, atomic multi-resource capacity,
explicit Endpoint Authorities, exact capability Routes in Operation identity, durable blocked
tickets, and CLI grouping derived from those tickets. One DispatchStore is deliberately one
single-revision execution domain while work is unfinished. The Runtime does not retain old code,
reconstruct old environments or supervise multiple historical revisions.

## 1. The four identities

Four identities that were previously compressed into an Endpoint name or a `lane` must remain
separate:

| Identity | Example | Authority |
|---|---|---|
| Provider Authority | `kie.main` | one account, deployment or compute pool sharing limits |
| Capability Route | `@narratage/seedance-2-mini@1#GenerateVideo` | the exact capability requested by the graph |
| Runtime Revision | digest of Runtime Closure plus author/runtime package-lock digests | the exact code, configuration and package closure that can resume work |
| Operation Ticket | one Build plus one regenerated Core Command | one durable request for execution admission |

An Authority id is explicit, stable and non-secret. It must not be derived from an API key. Two
Endpoint instances using the same Provider account use the same Authority id; two accounts use
different ids even when they come from the same package.

A Route is derived from the exact capability already present in the Need. Installing a new model
therefore adds no Core, CLI or Store enum. A non-model Endpoint still has a Route; only the human UI
may label this level “Model” when the package describes it that way.

The Runtime Revision is immutable for a Build. A Runtime Profile or package-lock change is admitted
only after every Build in the same execution domain is terminal. An unfinished Build is never
silently moved to another Provider or implementation revision.

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
ticket. OperationStore continues to own Operation identities and opaque Provider checkpoints after
external submission.

Deterministic Producers may use the same admission mechanism with ordinary resource claims, but
they do not pretend to have a Provider Authority. New component packages remain installable without
Store migrations.

## 4. One unfinished Runtime Revision per execution domain

A Worker declares exactly which Runtime Revision it can execute. Dispatch claiming is filtered by
that revision inside the Store transaction. A Worker must never claim a foreign Build and discover
the mismatch afterward.

Admission is intentionally stricter than claim filtering:

1. Runtime construction inspects all unfinished dispatches before constructing a Worker;
2. if any belongs to another Runtime Revision, construction fails with the conflicting Build ids;
3. Dispatch creation repeats that check atomically in the Store transaction;
4. `runtime up` performs the check before replacing a stale Worker or starting external programs.

The operator then makes one explicit choice: restore the old Profile and locks to finish or cancel
the old Builds, wait for them to finish, or select another DispatchStore as another execution
domain. Completed Builds do not block a revision change.

This rule removes Revision Bundles, historical code snapshots, multi-version Worker supervision
and Authority lifecycle state. Changing KIE to Fal, changing an account, or changing Provider code
is just a Runtime Revision change and follows the same law. Moving unfinished creative work to
another Provider remains a new Build with a new Run realization; it is not a queue action.

Lowering capacity below the current in-flight count never cancels work. It prevents new admission
until usage falls below the new limit.

## 5. Deployment and multi-process law

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

## 6. Runtime Profile boundary

The deployment explicitly gives each Endpoint instance an Authority id. Provider packages declare
their exact Routes through capabilities and contribute default resource limits. A Runtime Profile
may override limits by opaque resource id, but it does not define model semantics.

There is no implicit `generation` queue, global Provider list or model registry. `kie.main` is not a
reserved name; it is deployment data. Seedance is not a Runtime enum; it is an installed capability
package selected by the graph and bound by the Runtime Profile.

## 7. Acceptance laws

The implementation is complete only when tests establish all of these:

- a Worker cannot claim a Build from another Runtime Revision;
- one Ticket atomically consumes both Authority and Route capacity;
- two models share one Authority limit while retaining independent Route limits;
- the same model on KIE and Fal has independent Authority/Route queues;
- changing the current Profile is rejected while an unfinished Build belongs to the old revision;
- the rejection happens before a stale Worker is stopped or external programs are started;
- once every old Build is terminal, the same execution domain admits the new revision;
- lowering limits does not cancel in-flight work;
- queue inspection derives Provider-to-Route grouping from tickets, not a central registry;
- no ticket contains a serialized Command, Need, request body or credential;
- installing a new Provider or model requires no Core, CLI or Store schema change.
