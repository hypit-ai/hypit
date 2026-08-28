# `@hypit/runtime-local`

The default local Runtime for Hypit. It owns the Worker, scheduler, SQLite state and Build queue.
It contains no video, authoring or Provider policy.

A Runtime Profile selects only the environmental parts that genuinely vary:

```json
{
  "format": "hypit.runtime-profile@1",
  "runtime": {
    "use": "@hypit/runtime-local",
    "config": {
      "dataRoot": ".hypit/runtimes/local",
      "artifacts": {
        "use": "@hypit/artifact-store-fs",
        "config": { "path": "artifacts" }
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

Source imports select author packages. Runtime Profile entries select only code allowed to access files,
credentials, processes or networks. Installing a package changes neither selection.
