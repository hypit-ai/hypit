# `@hypit/runtime-local`

The default local Runtime for Hypit. It owns the Worker, scheduler and active SQLite execution
worklist. Project-owned Build Results hold finished public Outputs.

Managed Program preparation writes subprocess stdout and stderr directly to that Program's
`install.log`, so dependency-download output is readable before installation finishes. Installation
and startup progress expose `logPath`; failed installation reports retain it with a short error.
The files belong to the Program's configured state directory. Service output uses `program.log`
and, on Windows, a separate `program.err.log` for stderr. Keeping installation output separate
preserves it when Windows opens fresh service logs at startup.
The CLI retains Program failure reasons, PIDs and log paths in `programs` and `runtime up` reports.
Human output stays compact for successful preparation; `programs status --verbose` also shows
ready helpers, and JSON retains the reported details independently of verbosity.

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
  "@hypit/whisperx@1#whisperx-alignment": "whisperx.local"
}
```

A capability offered by exactly one Endpoint needs no binding. A contested capability without one is
reported by `doctor` and `plan` and blocks the Need at Build time; a binding to an Endpoint that does
not offer the capability is an error. `plan`, creation-time tools and the Build resolve Endpoints
through the same registry with the same bindings.

Disposable authoring clients may open one transient execution. It installs only immediate capabilities
whose Provider explicitly declares `transient: true`, keeps the same Profile bindings and resolves each
complete Need through its ordinary `supports` predicate. Pricing is informational and is never used as
an execution permission. The Runtime retains Endpoint handlers, credentials and Program readiness; the
client supplies its temporary Resources and receives no Endpoint registry. Declared concurrency is shared
inside that one disposable session only. A Provider that needs durable or cross-Build quota admission must
not opt that capability into transient execution.

A project that wants a non-default Result repository owns a separate `hypit.results.json`:

```json
{
  "format": "hypit.build-results@1",
  "use": "@hypit/build-result-s3",
  "config": { "bucket": "team-results", "prefix": "projects/episode-12" }
}
```

Submitting a Build stores it and returns. The Worker may advance unrelated Builds together; only the
resources declared by their Commands constrain execution. An Endpoint instance owns its capacity by
default. A Profile `pool` is only for instances that really share one account, deployment or compute
quota; exact-model limits may narrow it further. Build identity is not a capacity resource and creates
no second queue.
Claims may carry `units` (default 1): one render Need can occupy one request slot and four browser
slots at once. The same admission rule applies to total Provider capacity, exact models, and local
compute resources. SQLite retains the weighted reservation across Worker turns and restarts. This
coordinates Builds sharing this Runtime's Execution Store; it does not enforce a service's quotas
across other machines. Short-action limits are described below.

A failed request ends that Build's execution attempt. Runtime saves completed public Outputs and
non-secret Operation receipts with the failed Result, including any remote status still unknown.
It accepts results from calls already in progress before finalizing, without starting further work
or polling unfinished remote jobs.
It then releases local reservations. Submission timeouts with no receipt remain recorded failures;
a new Run and Build can request the remaining work. No original-Build reconciliation is required.
An explicit cancellation stops new work and makes one best-effort remote cancellation call when
supported; its acknowledgement is recorded separately from the local cancelled outcome.

`defaultConcurrency` and exact-model limits govern managed Need occupancy. Asynchronous Providers can
also expose `actionLimits` for `submit`, `poll` and `collect`; each action supports `concurrency` and
`rate: { limit, periodMs }`. These action budgets share the same Runtime store and real `pool` identity.
Rate permits replenish with time and are not returned when an action finishes. Rate counts admitted
actions, not every HTTP request a Provider may make inside one action. Cloud services own their actual
account-wide limits, including tasks submitted elsewhere or still running after a local failure.

The Worker yields to sockets and timers between graph reads. Resource waiters are awakened as capacity
becomes available; known Operations are polled from their own lightweight records. Graph hydration is
serialized, while network actions and local work remain concurrent under their declared limits.

HypiHub can be the explicitly selected gateway for users without their own service keys. A bound
Provider's authentication, quota or transport error never changes that selection. Separate Kie and
HypiHub accounts use separate pools even when they implement the same model.

Without `hypit.results.json`, the official video Distribution selects the filesystem adapter at the
project's `.hypit/results` directory, with no cloud account or service. Runtime Local opens that default
through the same adapter registry as an explicit `@hypit/build-result-s3` selection; it contains no
filesystem Repository shortcut.
Runtime working Resources remain internal and Build-local; there is no ResourceStore selector. After
a Result has an outcome, history is read from the selected repository, not Runtime SQLite.
The submission passes known Resource references to the Result writer, separately from the execution
graph. Staging bytes for a running Build does not make them new Result files: external and reused
resources keep their addresses even when a Producer embeds them inside a new Composite value.

While execution advances, Result synchronization publishes newly accepted public Outputs. The
repository leaves its files or objects untouched when no new public Output is available; internal
execution progress remains in SQLite. Once execution has a final decision, all accepted public Outputs
and the outcome are saved before active state and working Resources are removed. This order applies
to completed, failed and cancelled Builds alike.

Saving a finished Result is a separate, idempotent storage action. If that write is interrupted, the
Build keeps its already-decided outcome and reports exact operator attention. `hypit result finish
<build-id>` performs only that pending write and active-state cleanup; it does not run the execution
Worker, call a Producer or load Provider Endpoint packages. `hypit result discard <build-id>` is only
for a submission that never became active and therefore has no Result to save.

Source imports select author packages. Runtime Profile entries select only code allowed to access files,
credentials, processes or networks. Installing a package changes neither selection.

The lifecycle commands have deliberately narrow meanings:

- `hypit runtime init` writes and selects the Distribution's starter Profile; it performs no setup or
  network access and never overwrites an existing Profile.
- `hypit runtime up` prepares selected local dependencies, starts declared local Programs and starts
  the Worker. `hypit runtime down` stops the Worker; `hypit programs down` stops the Programs.
  Remote services have no lifecycle for Hypit to start or stop.
- `hypit runtime logs` reads the Worker's output, including separately redirected standard errors
  on Windows. The files are `worker.log` and `worker.err.log` under the Runtime data directory's
  `worker/`. Separate error output is labeled `[stderr]`; the files do not establish an interleaved
  event order. A failure before readiness also includes the recorded error in its startup message.
- `hypit doctor` is the active, read-only check. Endpoint-owned diagnostics may authenticate and read a
  remote capability catalog; normal preflight never does.
