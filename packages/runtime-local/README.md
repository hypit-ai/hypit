# `@hypit/runtime-local`

The default local Runtime for Hypit. It owns the Worker, scheduler and active SQLite execution
worklist. Project-owned Build Results hold finished public Outputs.

A Runtime Profile selects only the environmental parts that genuinely vary:

```json
{
  "format": "hypit.runtime-profile@1",
  "runtime": {
    "use": "@hypit/runtime-local",
    "config": {
      "dataRoot": ".hypit/runtimes/local",
      "credentials": {
        "env": { "use": "@hypit/credential-store-env" }
      },
      "endpoints": {}
    }
  }
}
```

A project that wants a non-default Result repository owns a separate `hypit.results.json`:

```json
{
  "format": "hypit.build-results@1",
  "use": "@hypit/build-result-s3",
  "config": { "bucket": "team-results", "prefix": "projects/episode-12" }
}
```

Submitting a Build stores it and returns. The Worker may advance unrelated Builds together; only the
resources declared by their Commands constrain execution. Endpoint packages declare the Provider
pool and model-lane limits that govern actual external work. Build identity is not a capacity
resource and creates no second queue.
Cancellation prevents new work and makes a best effort to cancel an external operation already submitted;
completed output is never rolled back.

Without `hypit.results.json`, Hypit uses the project's `.hypit/results` directory with no cloud
account or service. The project may instead select `@hypit/build-result-s3` for a shared repository.
Runtime working Resources remain internal and Build-local; there is no ResourceStore selector. After
a Result has an outcome, history is read from the selected repository, not Runtime SQLite.

Saving a finished Result is a separate, idempotent storage action. If that write is interrupted, the
Build keeps its already-decided outcome and reports exact operator attention. `hypit result finish
<build-id>` performs only that pending write and active-state cleanup; it does not run the execution
Worker, call a Producer or load Provider Endpoint packages. `hypit result discard <build-id>` is only
for a submission that never became active and therefore has no Result to save.

Source imports select author packages. Runtime Profile entries select only code allowed to access files,
credentials, processes or networks. Installing a package changes neither selection.
