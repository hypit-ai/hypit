# `@hypit/runtime-local`

The default local Runtime for Hypit. It owns the Worker, scheduler and active SQLite execution
worklist. Project-owned Build Results hold finished public Outputs.

This package also exports `createLocalRuntimeCliCommandModules()` from `@hypit/runtime-local/cli`.
The factory binds the exact Local Host port and returns the command contribution that owns
`runtime`, `programs`, `paths` and the internal Worker entry. The generic `@hypit/cli` Host owns
none of that local process vocabulary: it consumes a narrow `CliRuntimeHost` port for Build,
Result, credential and transient-execution operations. The root Hypit executable binds the Local
contribution at application assembly and keeps one `hypit` executable; a project package cannot
load an unbound Local Runtime module or make the generic context carry a private Host API.

Managed Program preparation writes subprocess stdout and stderr directly to that Program's
`install.log`, so dependency-download output is readable before installation finishes. Installation
and startup progress expose `logPath`; failed installation reports retain it with a short error.
Each preparation command adds its owner-supplied purpose (or executable name) and start/end time to
the log. Command arguments and environment values are not copied into these headings.
The files belong to the Program's configured state directory. Service output uses `program.log`
and, on Windows, a separate `program.err.log` for stderr. Keeping installation output separate
preserves it when Windows opens fresh service logs at startup.
The CLI retains Program failure reasons, PIDs and log paths in `programs` and `runtime up` reports.
Human output stays compact for successful preparation; `programs status --verbose` also shows
ready helpers, and JSON retains the reported details independently of verbosity.
With `--json`, preparation notices use stderr; stdout remains the final JSON result. Status reports
existing `installationLogPath`, `logPath` and Windows `errorLogPath` separately. These paths identify
historical files, not currently running phases.

Each Program Home has OS-owned exclusion for preparation, spawning and stopping. Concurrent lifecycle
commands for that home return the observed facts and a busy explanation; other Programs remain
independent. The empty `lifecycle.lock` file is only a lock address. The OS releases ownership on
command exit; no phase record, expiry, stale-lock deletion or recovery procedure is attached to it.
This uses the Distribution's existing native binding dependency for POSIX `flock` and Windows
exclusive file handles, rather than coordinating all services in a central table.

Startup publishes `process.pid` before waiting for the probe, then releases exclusion. Repeated `up`
observes that live process; `down` can stop it while it is still loading. A readiness observation
timeout leaves the process alone and reports that it remains alive. This is Program lifecycle
coordination, separate from Build execution; it does not retry or recover Builds.

A Runtime Profile selects only the environmental parts that genuinely vary:

```json
{
  "format": "hypit.runtime-local@1",
  "dataRoot": ".hypit/runtimes/local",
  "credentials": {
    "env": { "use": "@hypit/credential-store-env" }
  },
  "endpoints": {},
  "bindings": {}
}
```

The official video Distribution selects this Runtime implementation before it opens the file. The
Profile therefore describes only local execution and does not repeat a fake Runtime Host selector.

Providers declare everything they can do and never hide a capability. When two selected Endpoints
offer the same capability, `bindings` says which one serves it, keyed by the capability
(`name@version#capability`) and naming an Endpoint instance of this Profile:

```json
"bindings": {
  "@hypit/whisperx@1#whisperx-transcription": "whisperx.local"
}
```

A capability offered by exactly one Endpoint needs no binding. A contested capability without one is
reported by `doctor` and `plan` and blocks the Need at Build time; a binding to an Endpoint that does
not offer the capability is an error. `plan`, creation-time tools and the Build resolve Endpoints
through the same registry with the same bindings. Selection uses capability and return Type only.
`supports` runs afterward against the one selected Endpoint and never disambiguates or falls back to
another Endpoint.

For one `plan`, `pricing` or `build` command, the Host opens a short-lived Runtime inspection. It reads
and parses the Profile once, installs the selected adapters once and activates each relevant Endpoint
once. Endpoint selection, static pricing, preflight, Worker location and Build Runtime creation all use
that frozen snapshot. A Profile edit applies to the next command, not halfway through the current one.
The inspection is closed at command end; it is not persisted and does not cache dynamic pricing.
Its shared Runtime types distinguish a structural or concrete Endpoint query, deployment observation
and optional pricing enrichment. Runtime Hosts and CLI clients reuse those types instead of maintaining
parallel status unions.

Disposable authoring clients may open one transient execution. It installs only immediate capabilities
whose Endpoint explicitly declares `transient: true`, keeps the same Profile bindings and resolves each
complete Need through its ordinary `supports` predicate. Pricing is informational and is never used as
an execution permission. The Runtime retains Endpoint handlers, credentials and Program readiness; the
client supplies its temporary Resources and receives no Endpoint registry. Declared concurrency is shared
inside that one disposable session only. An Endpoint that needs durable or cross-Build quota admission must
not opt that capability into transient execution.

Build Results belong to the project at `.hypit/results`. Archiving or moving completed Results is a
post-Build project operation, not a Runtime repository choice.

Submitting a Build stores it and returns. The Worker may advance unrelated Builds together; only the
resources declared by their Commands constrain execution. An Endpoint instance owns its capacity by
default. A Profile `pool` is only for instances that really share one account, deployment or compute
quota; exact-model limits may narrow it further. Build identity is not a capacity resource and creates
no second queue.
Claims may carry `units` (default 1): one render Need can occupy one request slot and four browser
slots at once. The same admission rule applies to total Endpoint capacity, exact models, and local
compute resources. SQLite retains the weighted reservation across execution turns; an ended attempt releases its reservations. This
coordinates Builds sharing this Runtime's Execution Store; it does not enforce a service's quotas
across other machines. Short-action limits are described below.

A failed request ends that Build's execution attempt. Runtime saves completed public Outputs and
non-secret Operation receipts with the failed Result, including any remote status still unknown.
It accepts results from calls already in progress before finalizing, without starting further work
or polling unfinished remote jobs.
It then releases local reservations. Submission timeouts with no receipt remain recorded failures;
a new Invocation and Build can request the remaining work after accepted Outputs have become authored
project resources. No original-Build reconciliation is required.
An explicit cancellation stops new work and makes one best-effort remote cancellation call when
supported; its acknowledgement is recorded separately from the local cancelled outcome.

`defaultConcurrency` and exact-model limits govern managed Need occupancy. Asynchronous Endpoints can
also expose `actionLimits` for `submit`, `poll` and `collect`; each action supports `concurrency` and
`rate: { limit, periodMs }`. These action budgets share the same Runtime store and real `pool` identity.
Rate permits replenish with time and are not returned when an action finishes. Rate counts admitted
actions, not every HTTP request a Provider may make inside one action. Cloud services own their actual
account-wide limits, including tasks submitted elsewhere or still running after a local failure.

The Worker yields to sockets and timers between graph reads. Resource waiters are awakened as capacity
becomes available; known Operations are polled from their own lightweight records. Graph hydration is
serialized, while network actions and local work remain concurrent under their declared limits.
SQLite decodes each Operation record into its exact lifecycle union branch. Required phase facts must
be present, and facts owned by another phase are refused rather than carried forward as hidden state.
The `@1` representation is the complete persisted lifecycle model.

HypiHub can be the explicitly selected gateway for users without their own service keys. A bound
Provider's authentication, quota or transport error never changes that selection. Separate accounts use separate pools even when they implement the same model.

The official video Distribution writes Results to the project's `.hypit/results` directory, with no
cloud account or service. The filesystem implementation belongs to this single-host Runtime rather
than a public adapter registry.
Runtime working Resources remain internal and Build-local; there is no ResourceStore selector. After
a Result has an outcome, history is read from the project Result repository, not Runtime SQLite.
The submission passes known Resource references to the Result writer, separately from the execution
graph. Staging bytes for a running Build does not make them new Result files: external and reused
resources keep their addresses even when a Producer embeds them inside a new array or object value.

While execution advances, Result synchronization publishes newly accepted public Outputs. The
repository leaves its files or objects untouched when no new public Output is available; internal
execution progress remains in SQLite. Once execution has a final decision, all accepted public Outputs
and the outcome are saved before active state and working Resources are removed. This order applies
to completed, failed and cancelled Builds alike.

Saving a finished Result is a separate, idempotent storage action. If that write is interrupted, the
Build keeps its already-decided outcome and reports exact operator attention. `hypit result finish
<build-id>` performs only that pending write and active-state cleanup; it does not run the execution
Worker, call a Producer or load Provider packages. `hypit result discard <build-id>` is only
for a submission that never became active and therefore has no Result to save.

Source imports select author packages. Runtime Profile entries select only code allowed to access files,
credentials, processes or networks. Installing a package changes neither selection.

Endpoint scoping happens before activation when explicit instance IDs are supplied, or when every
requested capability has a binding. Otherwise discovery loads the Profile's Provider packages to
find eligible implementations. Thus unused service readiness is not required, but an uninstalled
declared package can still prevent unbound discovery. `scopedProfile` owns this distinction; package
names are not used to guess which capabilities they supply.

The lifecycle commands have deliberately narrow meanings:

- `hypit runtime init` writes and selects the Distribution's starter Profile; it performs no setup or
  network access and never overwrites an existing Profile.
- `hypit runtime up` prepares selected local dependencies, starts declared local Programs and starts
  the Worker. Repeat `--endpoint <instance>` to limit preparation to chosen services; omission covers
  the whole Profile. `doctor` and Program operations accept the same scope. Build preflight receives
  actual resolved Endpoint IDs and checks only their credentials and Programs. `hypit runtime down` stops the Worker; `hypit programs down` stops the Programs.
  Remote services have no lifecycle for Hypit to start or stop.
- `hypit runtime logs` reads the Worker's output, including separately redirected standard errors
  on Windows. The files are `worker.log` and `worker.err.log` under the Runtime data directory's
  `worker/`. Separate error output is labeled `[stderr]`; the files do not establish an interleaved
  event order. A failure before readiness also includes the recorded error in its startup message.
- `hypit doctor` is the active, read-only check. Endpoint-owned diagnostics may authenticate and read a
  remote capability catalog; normal preflight never does.

## Build execution evidence

The Worker records Endpoint calls independently of CLI follow. Local calls use the execution context;
remote Operations retain their existing receipts and contribute phase changes as they advance.
`fileExecutionLogs` appends `hypit.execution-log@1` records to `work/<build>/execution.jsonl` under the
Profile's `dataRoot`. Each record carries time, Command and Endpoint identity. Pure graph evaluation
and repeated progress counters do not become log entries. The latest counters remain active Runtime
state; Provider-authored diagnostics and phase changes are durable evidence.

Result finishing streams this log through the project Result repository before publishing the terminal
manifest or clearing the Build working directory. Complete, failed and cancelled Builds use the same
finishing path. A failed archive leaves Result attention and preserves the working directory; finishing
that Result performs no external execution. Log write failures also surface at the Result boundary,
without converting a successful Provider call into another generation attempt.

`hypit logs <build-id>` reads active evidence through Runtime control or finished evidence through the
project Result Repository. `runtime logs` remains the Worker's process log. Program installation and
service logs remain owned by their Program; they are shared service history, not copied into every Build.
The logger does not capture the process environment, credential values, request bodies or global console.

## Build-scoped execution

The long-lived Worker supervises execution carriers. Each Build has its own module scope,
Producer/Endpoint registries and selected configuration. Editing project code or Profile selections
applies to the next Build without restarting the Worker; already loaded modules remain bound to their
original Build. Installed Distribution modules stay process-owned. The Package Loader owns scoped
JavaScript/TypeScript loading, including transitive ESM and CommonJS dependencies.

One carrier shares a SQLite connection and event loop across active Builds. The database returns
ready Build IDs; the dispatcher opens that Build's context once, hydrates local work in sequence, then
lets asynchronous actions proceed concurrently. Pending remote submission does not hold a whole-Build
admission slot. Accepted Operations retain receipts and wake times; their next poll can advance without
materializing the whole graph. Endpoint-declared task limits, action concurrency and rates still govern
actual work. A remote task waiting in an eight-slot pool does not block another Build's unrelated local
step. CPU-heavy rendering belongs to its execution backend and declared resources.

The active execution request owns its opaque local context: project package root, Distribution root,
selected Endpoint configurations and bindings, and relevant Credential Store declarations. Source
compilation and execution use the same project package root. Core does not see these choices. Different
Profiles selecting the same Runtime data directory share its coordinator and capacity accounting; the
coordinator's startup directory and recorded Profile path do not select later Builds' project code.

`startedAt` records assignment to an execution carrier. Losing that carrier ends its assigned attempts
and preserves completed Outputs and external receipts, without resubmitting work. Unstarted queue
entries may still start. Result-writing failures retain the attention and `result finish` path. A live
carrier never reclaims another carrier's turns. These are module/registry contexts in trusted code,
not OS or security isolation: process globals, native libraries and a fatal process failure are shared.
The carrier has one working directory and inherited environment. Package-relative file access uses
module URLs; spawned tools receive their own explicit working directory and environment as needed.

After its assigned Builds end, the carrier exits and releases Node's module cache. The coordinator and
Managed Programs stay available. With continuous submissions, the coordinator can retire a carrier
from accepting new Builds while its assigned work continues in place. New work uses a fresh carrier;
all carriers share the same SQLite resource accounting. A live Build is never unloaded or moved.

The coordinator reads process policy from its startup Profile:

```json
"worker": { "executionMemoryMb": 1024 }
```

The default is 1024 MiB of execution-process RSS. It is a soft retirement budget, not a memory ceiling
or a limit on active Builds. Carriers report RSS after opening a Build context and when a Build ends.
Once a carrier has completed work and its reported RSS reaches the budget, it stops accepting new
Builds. Its remaining Builds finish before it exits. Live work alone does not trigger rotation, and
a fresh carrier can accept work even when its startup footprint exceeds the budget. There is no
forced timeout or replay. Draining carriers can still use substantial memory while long jobs run;
this policy reclaims finished-work accumulation, not the memory required by unfinished work.
The Profile that starts the coordinator owns this process policy until that coordinator exits.

Loaded module bindings are scoped, not the filesystem. Later file reads observe ordinary files;
a first-time dynamic import reads the implementation then available and subsequently remains cached
in that Build's scope. No source snapshot, filesystem scan, content hash or Build recovery is involved.
`createLocalRuntime` remains available for embeddings that explicitly supply their implementations.
Its `workOnce` advances fresh work or work already owned by that instance; an explicit request to
take over another context's started Build fails before any Provider call. The coordinator supplies
the assignment when opening each production Build context. Client code calls `worker.up()` on the
controller returned by `await host.controller()`, and calls `build(...)` on the Runtime returned by
`await host.createRuntime()`. There is one production process-lifecycle path.

Managed Programs have independent lifetimes. A healthy WhisperX service keeps its model loaded;
`programs prepare --endpoint <instance>` prepares selected resources without starting or stopping
that service. Its installation probe is independent of process health, so an online service does not
hide a newly requested language model. `programs up` prepares missing resources and starts the service
if needed. `prepareBeforeStart` additionally reconciles a cold installation through the package
manager's source-aware synchronization. The Provider owns the resource choices and commands;
Runtime only invokes them under the existing lifecycle lock.
`runtime down` stops the coordinator and asks its executors to stop; Programs are stopped separately.
Distribution changes and shell environment changes still concern the coordinator's bootstrap process.
Inspect active work before restarting it. Environment-backed credentials use that inherited process
environment; external writable Credential Stores resolve through their own implementation.

### Credential management without reading the old value

`openCredentials(endpoint)` opens only the selected Endpoint's credential control.
`describeCredentials(endpoint)` returns its declared slots and each Store's write capability without
resolving secrets. `credentials(endpoint)` also reads current values to report status and propagates
read failures. Login and logout use the former: a damaged old credential cannot prevent replacement
or deletion. Successful writes and deletions report their operation's result without rereading the
secret. Execution still resolves credentials normally and reports Store errors.
