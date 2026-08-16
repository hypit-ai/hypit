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
* dispatch and concurrency;
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
  "runtime": {
    "use": "@narratage/runtime-local",
    "config": {
      "dataRoot": ".narratage/runtimes/local",
      "infrastructure": {
        "execution": { "use": "@narratage/runtime-local" },
        "state": {
          "use": "@narratage/store-sqlite",
          "config": { "path": "state.sqlite" }
        },
        "artifacts": {
          "use": "@narratage/artifact-store-fs",
          "config": { "path": "artifacts" }
        }
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
      "endpoints": {
        "media": { "use": "@narratage/provider-media-local" }
      },
      "capacity": { "maxActiveOperations": 4 }
    }
  }
}
```

`infrastructure` creates named package instances. Each instance may expose several named parts.
`roles` selects those parts explicitly; installed or configured packages never select themselves.
`endpoints` configures external capability implementations. `capacity` bounds this Runtime as a whole.

The Profile contains no source root or author package selection. Those belong to the project and
its Source imports. Relative Profile paths resolve from the Profile file;
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

## Packages, instances, parts and roles

A Runtime package is installed code. An entry under `infrastructure` creates one configured
**instance** of that package. The package may expose several cohesive **parts**. For example,
`@narratage/store-sqlite` exposes `builds`, `operations` and `dispatch` from one `state` instance and
one database. A **role** selects one exact `{ from, part }` pair:

```json
"buildStore": { "from": "state", "part": "builds" }
```

`from` always names a configured instance; `part` is declared by that instance's package. The Host
validates that the selected part implements the requested role. No central registry knows SQLite,
and no dotted string is parsed to guess ownership.

An Endpoint supplies one or more declared capabilities. An author package may explicitly request a
particular model capability; the Profile binds that request to configured Endpoint instances.
Provider selection is deployment configuration, never a hidden creative decision by Core.

Infrastructure and Endpoints are loaded only when the Runtime Profile selects their logical `use`
names. Installing a package adds an available implementation; it does not alter Core or activate
itself.

## Managed Programs

A Managed Program is a long lived external process declared by an Endpoint, such as a warm local
WhisperX server. It is not a Runtime infrastructure and not a queue. The Endpoint declares how to probe
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
narratage runtime use narratage.runtime.json
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
3. the entry source directory.

The Runtime Profile may not widen that boundary. Runtime package installation paths are Host
implementation details and may not become source roots.

## Trust

Source imports and Runtime Profile entries are separate selections because they grant different
authority. Compilation activates the source-selected subset. Runtime activation is limited to the
adapter closure selected by the Profile. Unfinished Builds retain only the installed package names
their Worker must load; npm or pnpm owns installed versions and bytes.

Node Runtime packages are trusted deployment code until Narratage has a real process or Wasm
isolation boundary. A manifest or claimed digest is not a sandbox.
