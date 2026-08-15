# `@narratage/runtime-local`

Local Runtime Host for Narratage. The package owns local process lifecycle, durable dispatch and
assembly of explicitly selected Runtime infrastructures. It contains no authoring, video or Provider
routing policy.

The Runtime Profile selects this Host at the top level, then configures its private deployment:

```json
{
  "format": "narratage.runtime-profile@1",
  "runtime": {
    "use": "@narratage/runtime-local",
    "config": {
      "dataRoot": ".narratage/runtimes/local",
      "infrastructure": {
        "execution": { "use": "@narratage/runtime-local" },
        "state": { "use": "@narratage/store-sqlite", "config": { "path": "state.sqlite" } },
        "artifacts": { "use": "@narratage/artifact-store-fs", "config": { "path": "artifacts" } }
      },
      "roles": {
        "scheduler": { "from": "execution", "part": "scheduler" },
        "worker": { "from": "execution", "part": "worker" },
        "buildStore": { "from": "state", "part": "builds" },
        "operationStore": { "from": "state", "part": "operations" },
        "dispatchStore": { "from": "state", "part": "dispatch" },
        "artifactStore": { "from": "artifacts", "part": "store" },
        "credentialStores": []
      },
      "endpoints": {},
      "capacity": { "maxActiveOperations": 4 }
    }
  }
}
```

`infrastructure` declares configured package instances; `roles` selects exact package parts.
Nothing is selected by presence or uniqueness. `endpoints` declares capability implementations and
their Managed Programs. `capacity` belongs to this Runtime deployment, not to Core or Author Source.

## Execution

Build submission creates durable state and returns. A detached Worker claims dispatches and asks
Core to regenerate Commands from verified Build facts after every restart. Provider recovery data
stays with each Operation; cancellation closes Build admission and reconciles work already submitted.

The Runtime Controller owns the local Worker and Managed Program lifecycle. The generic CLI calls
that Controller and has no PID, signal, log path or Python/Node process policy of its own.

## Boundaries

* The Runtime Profile contains no Source Workspace or author package selection.
* `dataRoot` contains deployment state, never author source or credentials.
* Source imports select author packages; Profile `use` fields select Runtime packages.
* Infrastructure parts and Endpoints communicate through declared ports and capabilities; this Host
  keeps no central list of video packages.

The local Host is one possible implementation. Another package may expose the same Node Runtime Host
facet and submit Builds to a remote deployment without changing the CLI or Core.
