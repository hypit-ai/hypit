# `@narratage/local`

Local Runtime Host for Narratage. The package owns local process lifecycle, durable dispatch and
assembly of explicitly selected Runtime Components. It contains no authoring, video or Provider
routing policy.

The Runtime Profile selects this Host at the top level, then configures its private deployment:

```json
{
  "format": "narratage.runtime-profile@1",
  "runtimePackageLock": "./svml.runtime-packages.lock",
  "runtime": {
    "use": "@narratage/local",
    "config": {
      "dataRoot": ".narratage/runtimes/local",
      "components": {
        "execution": { "use": "@narratage/local" },
        "state": { "use": "@narratage/store-sqlite", "config": { "path": "state.sqlite" } },
        "artifacts": { "use": "@narratage/artifact-store-fs", "config": { "path": "artifacts" } }
      },
      "bindings": {
        "scheduler": "execution.scheduler",
        "worker": "execution.worker",
        "stores": {
          "build": "state.builds",
          "operations": "state.operations",
          "dispatch": "state.dispatch",
          "artifacts": "artifacts",
          "credentials": []
        }
      },
      "endpoints": {},
      "limits": { "maxOperations": 4 }
    }
  }
}
```

`components` declares available infrastructure instances; `bindings` selects exact role facets.
Nothing is selected by presence or uniqueness. `endpoints` declares capability implementations and
their Managed Programs. `limits` belongs to this Runtime deployment, not to Core or Author Source.

## Execution

Build submission creates durable state and returns. A detached Worker claims dispatches and asks
Core to regenerate Commands from verified Build facts after every restart. Provider recovery data
stays with each Operation; cancellation closes Build admission and reconciles work already submitted.

The Runtime Controller owns the local Worker and Managed Program lifecycle. The generic CLI calls
that Controller and has no PID, signal, log path or Python/Node process policy of its own.

## Boundaries

* The Runtime Profile contains no Source Workspace or Source package lock.
* `dataRoot` contains deployment state, never author source or credentials.
* `svml.runtime-packages.lock` closes privileged Runtime packages.
* `svml.packages.lock` independently closes source and compute implementations for one project.
* Components and Endpoints communicate through their declared facets and capabilities; this Host
  keeps no central list of video packages.

The local Host is one possible implementation. Another package may expose the same Node Runtime Host
facet and submit Builds to a remote deployment without changing the CLI or Core.
