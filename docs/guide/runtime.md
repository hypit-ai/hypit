---
title: Runtime
description: The execution boundary outside Narratage source and Core.
---

# Runtime

Narratage keeps three decisions separate:

| Owner | Decides |
|---|---|
| Workspace | Which source files and local assets one compilation may read |
| Runtime Profile | Which execution environment receives a frozen Build |
| Runtime | How that Build is queued, executed, stored and observed |

The Runtime Profile does not define the Workspace. A Profile may be reused by many projects, and a
project may submit Builds to different Profiles without changing its author source.

## Runtime boundary

Core is a domain neutral state machine. It accepts facts, derives Commands and verifies returned
Records. It does not start processes, read credentials, choose Providers or know that a Build makes
video.

A Runtime receives one already compiled Build and owns everything environmental:

* durable Build and Operation state;
* dispatch, leases and concurrency;
* Artifact and Credential storage;
* Endpoint activation and Provider calls;
* optional long lived programs;
* lifecycle, status, logs and cancellation.

The generic CLI talks to the selected Runtime through one Runtime Controller. It never assumes that
the Runtime is a local Node process. A local controller may own a detached Worker; a remote
controller may submit the same Build over HTTP.

## Runtime Profile

A Profile selects one Runtime adapter and gives that adapter closed configuration:

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
        "state": {
          "use": "@narratage/store-sqlite",
          "config": { "path": "state.sqlite" }
        },
        "artifacts": {
          "use": "@narratage/artifact-store-fs",
          "config": { "path": "artifacts" }
        }
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
      "endpoints": {
        "media": { "use": "@narratage/provider-media-local" }
      },
      "limits": { "maxOperations": 4 }
    }
  }
}
```

`components` configures replaceable Runtime pieces. One Component may expose several related role
facets. `bindings` selects the exact instance for each singleton role. `endpoints` configures
capability implementers. `limits` bounds this Runtime as a whole. Presence never implies selection.

The Profile contains no source package lock, source root or author package selection. Those belong
to the project and the compilation command. Relative Profile paths resolve from the Profile file;
relative local Runtime data paths resolve beneath `dataRoot`.

## Project state

Selecting a Profile writes one relative pointer:

```text
.narratage/
  runtime
```

A project local Runtime normally keeps its private state alongside that pointer:

```text
.narratage/
  runtime
  runtimes/
    local/
      worker/
      state.sqlite
      artifacts/
```

These paths are deployment state, not source. `check` and `plan` never create them. `runtime use`
creates only the pointer. A local Runtime creates its data directory only when it is explicitly
started or receives a Build.

## Host state

Host global state is reserved for a Managed Program that is deliberately shared across projects.
It never contains source, Build state, Artifacts or credentials.

The default location follows the operating system:

| Platform | Location |
|---|---|
| macOS | `~/Library/Application Support/Narratage` |
| Linux | `$XDG_STATE_HOME/narratage`, otherwise `~/.local/state/narratage` |
| Windows | `%LOCALAPPDATA%\\Narratage` |

`NARRATAGE_STATE_HOME` overrides it. `narratage paths` reports every effective location. A command
prints the location before its first write. A program that is externally owned and only probed does
not create Narratage host state.

## Components, bindings and endpoints

A Runtime Component is a configured package instance that supplies one or more infrastructure
facets such as Scheduler, Worker or Store. A Runtime Binding chooses an exact facet instance. This
keeps a package free to bundle cohesive implementation parts without giving package presence any
routing authority.

An Endpoint supplies one or more declared capabilities. An author package may explicitly request a
particular model capability; the Profile binds that request to configured Endpoint instances.
Provider selection is deployment configuration, never a hidden creative decision by Core.

Both Components and Endpoints are loaded only from the separately verified runtime package lock.
Installing a package adds an available implementation; it does not alter Core or activate itself.

## Managed Programs

A Managed Program is a long lived external process declared by an Endpoint, such as a warm local
WhisperX server. It is not a Runtime Component and not a queue. The Endpoint declares how to probe
it and may declare how to prepare or start it. If lifecycle ownership remains external, it declares
only a probe.

```bash
narratage programs status
narratage programs up
narratage programs down
```

Build preparation starts only Programs required by demanded capabilities. Explicit `programs up`
acts on the complete selected Profile. Runtime shutdown does not automatically stop shared Programs.

## Lifecycle

```bash
narratage runtime use svml.runtime.json
narratage runtime up
narratage runtime status
narratage runtime logs
narratage runtime down
```

These commands are controller operations. Their behavior belongs to the selected Runtime adapter.
For a local adapter, `up` owns one durable Worker domain. For a remote adapter, the same command may
only verify reachability. The generic CLI renders the result but does not manage PIDs or signals.

`build` submits a fresh Build identity and returns after durable admission unless `--follow` is
present. A running Build may be observed or cancelled. A terminal Build is never reopened; reuse of
prior material is expressed by Run Candidates, not Build identity.

## Workspace resolution

The compiler resolves its Workspace independently of Runtime content, in this order:

1. explicit `--workspace`;
2. the project containing the selected `.narratage/runtime` pointer;
3. the nearest source package lock;
4. the entry source directory.

The Runtime Profile may not widen that boundary. Runtime package installation paths are Host
implementation details and may not become source roots.

## Trust

Source packages and Runtime packages have separate locks because they run with different authority.
Compilation activates the exact source selected subset. Runtime activation is limited to the exact
adapter closure selected by the Profile. The frozen source implementation closure accompanies the
Build so the Runtime can verify what it is asked to execute.

Node Runtime packages are trusted deployment code until Narratage has a real process or Wasm
isolation boundary. A manifest or claimed digest is not a sandbox.
