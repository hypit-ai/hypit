# `@hypit/runtime-local`

The default local Runtime for Hypit. It owns the Worker, scheduler, active SQLite execution state
and Build queue. Project-owned Build Results hold terminal public Outputs.

A Runtime Profile selects only the environmental parts that genuinely vary:

```json
{
  "format": "hypit.runtime-profile@1",
  "runtime": {
    "use": "@hypit/runtime-local",
    "config": {
      "dataRoot": ".hypit/runtimes/local",
      "results": {
        "use": "@hypit/build-result-fs",
        "config": { "path": ".hypit/results" }
      },
      "credentials": {
        "env": { "use": "@hypit/credential-store-env" }
      },
      "endpoints": {}
    }
  }
}
```

Submitting a Build stores it and returns. The local Worker advances several Builds concurrently while
sharing the configured command limit. Endpoint packages declare their own Provider and model limits.
Cancellation prevents new work and makes a best effort to cancel an external operation already submitted;
completed output is never rolled back.

`results` is optional. Without it, Hypit uses the project's `.hypit/results` directory with no cloud
account or service. It may instead select `@hypit/build-result-s3` for a shared project repository.
Runtime working Artifacts remain internal and Build-local; there is no ArtifactStore selector. After
a Result is terminal, history is read from the selected repository, not Runtime SQLite.

Source imports select author packages. Runtime Profile entries select only code allowed to access files,
credentials, processes or networks. Installing a package changes neither selection.
