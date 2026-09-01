---
title: Runtime
description: The execution boundary outside Hypit source and Core.
---

# Runtime

Hypit keeps three decisions separate:

| Owner | Decides |
|---|---|
| Workspace | Which source files and local assets compilation may read |
| Runtime Profile | Which environmental packages may be used |
| Local Runtime | How active Builds are queued, executed and observed |
| Project Build Results | Which completed public Outputs belong to each Build |

Core is a domain neutral state machine. It accepts facts, derives Commands and verifies returned
Records. It does not start processes, read credentials, choose Providers or know that a Build makes
video.

`@hypit/runtime-local` is the default execution environment. It owns one Worker, scheduler, Build
queue and SQLite database. Those are one implementation, not user-selectable pseudo-components.

## Runtime Profile

The Profile contains only environmental choices that genuinely vary:

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
      "endpoints": {
        "media": { "use": "@hypit/provider-media-local" }
      }
    }
  }
}
```

* `credentials` selects stores for explicit credential references.
* `endpoints` selects exact Provider implementations and their configuration.

Installing a package only makes an implementation available. A Profile must select it. The Profile
contains no Workspace, author imports or creative routing.

## Local state

Selecting a Profile writes a project pointer. Execution data stays under `dataRoot`:

```text
.hypit/
  runtime
  runtimes/
    local/
      runtime.sqlite
      work/
      worker/
      programs/
  results/
    <build-id>/
      result.json
      files/
      values/
```

`check` and `plan` do not create Runtime data. SQLite holds only active execution facts, Provider
Operations and queue state. Each active Build has a private working byte directory. On an ordinary
complete, failed or cancelled path, once the Result is safely written, its heavy SQLite execution
rows and working bytes are removed. If writing the Result itself fails, the working state is kept for
local repair. One small terminal dispatch row may remain for Runtime status. It is not the history
source.

Historical content lives in the project, not the Profile: `.hypit/results/<build-id>/result.json`
names final Targets and every public Author Output that actually completed on their route. Media is
under that Result's `files/`; structured values are under `values/`. `builds`, `history`, `inspect`,
`get` and `build-record` read these Results directly and never need Runtime SQLite or a selected byte
store.

The Workspace is resolved independently from the explicit `--workspace`, the project containing the
Runtime pointer, or the entry source directory. Runtime configuration cannot widen source access.

## Queue and concurrency

`build` admits a fresh Build and returns. The Worker advances every runnable Build while Core
preserves each Build's graph dependencies. Endpoint packages declare Provider and capability limits,
so work from separate Builds shares the exact external capacity that performs it.

Cancellation is best effort. Queued work is withdrawn before it starts; running work stops receiving
new commands and an Endpoint may try to cancel an already submitted external operation. Completed
output is retained and never rolled back.

## Managed Programs

An Endpoint may declare a long-lived helper such as a warm local WhisperX service. The Endpoint owns
its probe and optional start command; the local Runtime only supervises it.

```bash
hypit programs status
hypit programs up
hypit programs down
```

`programs up` first prepares the selected Endpoint packages' upstream npm dependencies, then operates
their declared programs. The commands do not open SQLite or Credential Stores.

## Lifecycle

```bash
hypit runtime use hypit.runtime.json
hypit runtime up
hypit runtime status
hypit runtime logs
hypit runtime down
```

`runtime up` asks npm to prepare the selected adapters' exact upstream packages in the shared
machine home, prepares declared Managed Programs, then starts the local Worker. `build` performs no
provisioning: it runs cheap read-only preflight, submits work only when ready, and ensures the Worker
is available. `status`, `queue` and `cancel` observe or control active work. A terminal Build is not
resumed. Reusing an earlier Result is an explicit Candidate in a new `.svrun`, not hidden Runtime
behavior.

A running Worker loads installed Component packages as Builds first require them. A later Build may
name a new Component package without restarting the Worker; the Worker loads only packages it has
not already seen from that package's complete dependency closure. Loaded package code is not hot
reloaded, so editing a package or updating the Distribution still requires stopping an idle Worker
before the next Build.

Runtime packages are trusted local deployment code. npm or pnpm owns their installed versions;
Hypit only selects exact requirements and invokes npm at the explicit `runtime up`/`packages install`
boundary. It has no second package lock and does not claim that metadata is a sandbox.
