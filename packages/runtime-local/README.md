# `@hypit/runtime-local`

The default local Runtime for Hypit. It owns the Worker, scheduler and active SQLite execution
worklist. Project-owned Build Results hold finished public Outputs.

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
across other machines. Request-frequency limits are a separate Provider policy.

Runtime first persists a `stop` request for either user cancellation or execution failure. Its first
cause and reason are retained; repeated cancellation cannot replace a recorded failure. The Worker
resumes that stop after a restart without starting new Needs or storing control flags in Operation
failure codes. It requests cancellation of already submitted Operations once.
If cancellation is only accepted or unsupported, Runtime polls the same remote work until it ends,
retaining its capacity and working Resources. A failed Build also settles unfinished Operations before
writing its final Result and cleaning up. Completed output is never rolled back. An unknown submission
acknowledgement remains visible as `submission-unknown`; it needs external confirmation, not an automatic
retry, expiry or forced release.

HypiHub can be the explicitly selected gateway for users without their own service keys. A bound
Provider's authentication, quota or transport error never changes that selection. Separate Kie and
HypiHub accounts use separate pools even when they implement the same model.

Without `hypit.results.json`, the official video Distribution selects the filesystem adapter at the
project's `.hypit/results` directory, with no cloud account or service. Runtime Local opens that default
through the same adapter registry as an explicit `@hypit/build-result-s3` selection; it contains no
filesystem Repository shortcut.
Runtime working Resources remain internal and Build-local; there is no ResourceStore selector. After
a Result has an outcome, history is read from the selected repository, not Runtime SQLite.

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
- `hypit runtime up|down` manages local package preparation, declared local Programs and the Worker.
  Remote services have no lifecycle for Hypit to start or stop.
- `hypit doctor` is the active, read-only check. Endpoint-owned diagnostics may authenticate and read a
  remote capability catalog; normal preflight never does.
