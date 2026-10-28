---
title: Runtime
description: Select execution services, run independent Builds and keep their Results available.
---

The Source describes the work and its durable realization choices. An Invocation chooses Targets and
optional transient overrides; a `.svrun` file can save that Invocation. The Runtime executes it using
the selected services, and the project keeps accepted material as ordinary authored resources.

| Owner | Responsibility |
| --- | --- |
| Project | Sources, assets, component packages and the selected Runtime Profile |
| Distribution | The installed executable, public SDKs and execution implementation |
| Runtime Profile | Provider Endpoints, credential references, bindings and shared capacity |
| Build | One execution attempt using the selected graph and configuration |
| Result repository | Completed public Outputs, outcome and retained execution evidence |

Core plans and advances dependencies without knowing that they make a video. A new component or
[Provider](./providers.md) supplies its behavior through the same package interfaces.

## Select the project and Profile

Run commands from a project whose `package.json` declares `"hypit": { "project": true }`, or select
it explicitly with `--project`. Otherwise the CLI searches upward for that marker. An Author Package,
arbitrary directory, Source filename or Runtime configuration does not choose this boundary.

```bash
hypit paths
hypit runtime init
```

`runtime init` writes an editable starter `hypit.runtime.json` and selects it through the project's
`.hypit/runtime` file. It preserves an existing Profile and performs no installation, login or execution.
The starter offers HypiHub for hosted generation and WhisperX, with local media processing and rendering.
Choose the services that fit the work before preparing them. Local inference and project Providers can
use the same setup, including alongside HypiHub.

Use `hypit runtime use <profile>` to select an existing Profile. An explicit `--runtime <profile>`
overrides it for one invocation. Commands read only the selected project's pointer; they do not inherit
another project's selection. Relative command-line paths are relative to the current directory.

## Runtime Profile

A small local-processing Profile looks like this:

```json
{
  "format": "hypit.runtime-local@1",
  "dataRoot": ".hypit/runtimes/local",
  "credentials": {},
  "endpoints": {
    "media.local": { "use": "@hypit/media-local" }
  },
  "bindings": {}
}
```

`dataRoot` locates active execution data and working files, separately from the `.hypit/runtime`
selection file. Each `endpoints` entry selects an installed Provider and its configuration. Credentials
use references into a selected store; secret values stay outside the Profile and Sources.

A single compatible Endpoint can serve a capability without a binding. When several offer it, a
binding states which instance to use. For example, with an explicitly configured local WhisperX:

```json
"bindings": {
  "@hypit/whisperx@1#whisperx-transcription": "whisperx.local"
}
```

Installing a package makes it available; selecting it gives it a role in this environment. The Model
owns request meaning, and the Provider owns support, service mapping and pricing. A failed service
request does not silently select another account. Read the chosen Provider's README for its settings.

## Prepare only the services needed now

For local media processing, prepare the selected tools and start the Worker:

```bash
hypit runtime up --endpoint media.local
hypit runtime status
```

To prepare resources without starting a helper or Worker, use
`hypit programs prepare --endpoint media.local`. Inspect their readiness with
`hypit programs status --endpoint media.local`; use `hypit doctor --endpoint media.local` when
checking a configuration or diagnosing a failure. These are available tools, not a required sequence.

Local media processing declares no credentials. For a chosen service that declares credential slots,
inspect those separately with `hypit auth status <endpoint>`. For example, after choosing HypiHub,
use `hypit auth status hypihub.default` and connect the account with `hypit auth login hypihub.default`
when needed.

Use the actual Endpoint names from the Profile; repeat `--endpoint` for several. Omission covers the
whole Profile. `doctor` reads configuration and performs the selected Providers' diagnostics without
submitting generation. Read warnings as well as errors: a stored credential or reachable catalogue
is not proof that every request will succeed. With no Runtime selected, doctor checks project Results only.

`runtime up` prepares the selected local dependencies and Managed Programs, then starts the Worker.
It does not log into or start hosted services. `programs prepare|up|status|down` manages those local resources and helpers
separately. Initial inference setup can require substantial downloads; compare that effort with hosted
execution and choose the route before starting preparation.

`plan <run>` checks the work's demanded capabilities and cheap readiness. Provider discovery needs
installed package declarations; it may load other declared Endpoints when no explicit binding selects
a route. Unused services need not be running or logged in. `build` provisions nothing: it requires
its dependencies ready, starts an available Worker if necessary, and submits one Build.
[Invocations and Builds](../quickstart/run.md) explains planning, prices, authorization and explicit reuse.

## Execute independently of the terminal

```bash
hypit build build.svrun --follow
hypit status <build-id> --watch
hypit logs <build-id> --lines 80
```

The Worker owns execution. `--follow` and `status --watch` observe it; closing that terminal or reaching
a watch timeout does not cancel the Build. To stop a specific attempt, use `hypit cancel <build-id>`.
Remote cancellation is best effort, and completed Outputs remain available.

A failed attempt stays failed. Export useful Outputs into the project, update the Author Source, and use a new Invocation for the next Build. If execution
has finished but Result storage needs attention, `status` names `hypit result finish <build-id>`:
that completes the pending save, without executing generation again.

Build logs retain Provider phases and diagnostics. `runtime logs` instead reads Worker startup and
process errors; installation and service logs belong to the selected Managed Program. A missing
terminal transcript does not imply missing execution evidence.

## Share capacity, retain independent work

Several Builds can progress together. Limits belong to the account, deployment or local compute
resource using them. Remote waiting does not reserve a whole-Build slot that blocks unrelated local
work. Providers can distinguish active tasks from short submit, poll and collect calls. Inspect
`hypit activity --verbose` for shared capacity alongside active work.

Builds use independent loaded project implementations and selected configuration. Editing a project
component or Profile applies to the next Build; already started work keeps its loaded implementation.
Managed Programs have separate lifetimes, so a warm WhisperX model can serve multiple Builds.

Distribution updates and changes to the Worker's inherited shell environment concern its process
lifetime. Inspect active work before restarting it: `runtime down` ends active execution contexts,
while `programs down` stops helpers separately. A lost executor ends its attempts; continuation uses
new Builds and explicit reuse. This is execution separation, not a security sandbox or a frozen copy
of files a component reads later.

## Keep products with the project

Results live with the project in `.hypit/results` on the machine running Hypit. A local workstation,
an SSH Linux host and the official WebUI backend use the same rule: the whole Runtime moves to that
host instead of splitting its queue, working files and Result storage across services. Archive or
migrate completed Results explicitly after a Build when needed.

Results publish completed public Outputs as they become available and retain the terminal outcome.
A new Output can reference an existing file, including within a composite; it does not necessarily
create new media bytes. Explicit local file references remain live. Keep dependencies available for
future reuse. `get` creates a separate export when a person or another tool needs those files.

`builds`, `history`, `inspect` and `get` read project Results without requiring the original Runtime.
For exact storage and execution interfaces, see the
[Result package](https://github.com/hypit-ai/hypit/blob/main/packages/result/README.md) and
[local Runtime package](https://github.com/hypit-ai/hypit/blob/main/packages/runtime-local/README.md).
