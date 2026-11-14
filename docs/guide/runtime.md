---
title: Runtime
description: Select execution services, run independent Builds and keep their Results available.
---

The Source describes the work and its project-material references. Each command explicitly chooses
Targets. The Runtime executes that finite work using
the selected services, and the project keeps accepted material as ordinary authored resources.

| Part | What it contains |
| --- | --- |
| Project | Sources, assets, component packages and the selected Generation Runtime Profile |
| Hypit installation | Commands and installed packages |
| Generation Runtime Profile | Worker and Build execution policy plus an Environment reference |
| Environment Profile | Provider Endpoints, credential references, bindings and shared capacity |
| Build | One execution attempt using the selected work and configuration |
| Result repository | Targets, outcome, retained Outputs and execution evidence |

## Select the project and Profile

Run commands from a project whose `package.json` declares `"hypit": { "project": true }`, or select
it explicitly with `--project`. Otherwise the CLI searches upward for that marker. An Author Package,
arbitrary directory, Source filename or Runtime configuration does not choose this boundary.

```bash
hypit paths
hypit runtime init
```

`runtime init` writes `hypit.generation-runtime.json` and its referenced `hypit.environment.json`, then selects
the Generation Runtime Profile through the project's `.hypit/generation/runtime-profile` file. It preserves
existing files and performs no installation, login or execution. The starter offers HypiHub for hosted
capabilities, with local media processing and rendering.
Choose the services that fit the work before preparing them. Local inference and project Providers can
use the same setup, including alongside HypiHub.

Use `hypit runtime use <profile>` to select an existing Profile. An explicit `--runtime <profile>`
overrides it for one invocation. Commands read only the selected project's pointer; they do not inherit
another project's selection. Relative command-line paths are relative to the current directory.

## Generation Runtime and Environment Profiles

Generation execution state and deployment selection have different owners. The Generation Runtime
Profile references the Environment Profile:

```json
{
  "format": "hypit.generation-runtime-local@1",
  "dataRoot": ".hypit/generation/runtime/local",
  "environment": "./hypit.environment.json"
}
```

```json
{
  "format": "hypit.execution-environment-local@1",
  "dataRoot": ".hypit/environment/local",
  "credentials": {},
  "endpoints": {
    "media.local": { "use": "@hypit/provider-media-local" }
  },
  "bindings": {}
}
```

The first `dataRoot` locates active Generation execution data. The Environment `dataRoot` belongs to
credentials and managed Programs. Each `endpoints` entry selects an installed Provider and its
configuration. Credentials use references into a selected store; secret values stay outside both
Profiles and Sources.

A single compatible Endpoint can serve a capability without a binding. When several offer it, a
binding states which instance to use. For example, with an explicitly configured local WhisperX:

```json
"bindings": {
  "@hypit/whisperx#whisperx-transcription": "whisperx.local"
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
`hypit programs prepare --environment ./hypit.environment.json --endpoint media.local`. Inspect their readiness with
`hypit programs status --environment ./hypit.environment.json --endpoint media.local`; use `hypit doctor --environment ./hypit.environment.json --endpoint media.local` when
checking a configuration or diagnosing a failure. These are available tools, not a required sequence.

Local media processing declares no credentials. For a chosen service that declares credential slots,
inspect those separately with `hypit auth status <endpoint>`. For example, after choosing HypiHub,
use `hypit auth status hypihub.default` and connect the account with `hypit auth login hypihub.default`
when needed.

Authentication and Environment diagnosis do not require Generation execution. Address the
Environment Profile directly when using these capabilities outside a Build:

```bash
hypit doctor --environment ./hypit.environment.json
hypit auth status hypihub.default --environment ./hypit.environment.json
hypit auth login hypihub.default --environment ./hypit.environment.json
```

Using `--runtime ./hypit.generation-runtime.json` remains an indirect convenience: it follows that
Runtime Profile's Environment reference. It does not make the credentials part of Generation Runtime.

Use the actual Endpoint names from the Profile; repeat `--endpoint` for several. Omission covers the
whole Profile. `doctor` reads configuration and performs the selected Providers' diagnostics without
submitting generation. Read warnings as well as errors: a stored credential or reachable catalogue
is not proof that every request will succeed. With neither Environment nor Runtime selected, doctor
checks project Results only.

`runtime up` prepares the selected local dependencies and Managed Programs, then starts the Worker.
It does not log into or start hosted services. `programs prepare|up|status|down --environment <profile>` manages those local resources and helpers
separately. Initial inference setup can require substantial downloads; compare that effort with hosted
execution and choose the route before starting preparation.

`hypit plan <source> --target <output>` checks the work's demanded capabilities and cheap readiness. Provider discovery needs
installed package declarations; it may load other declared Endpoints when no explicit binding selects
a route. Unused services need not be running or logged in. `build` provisions nothing: it requires
its dependencies ready, starts an available Worker if necessary, and submits one Build.
[Targets and Builds](../quickstart/run.md) explains planning, prices, authorization and explicit reuse.

## Execute independently of the terminal

```bash
hypit build main.svml --target final.video --follow
hypit status <build-id> --watch
hypit logs <build-id> --lines 80
```

The Worker owns execution. `--follow` and `status --watch` observe it; closing that terminal or reaching
a watch timeout does not cancel the Build. To stop a specific attempt, use `hypit cancel <build-id>`.
Remote cancellation is best effort, and completed Outputs remain available.

A failed attempt stays failed. Export useful Outputs into the project, update the Author Source, and submit a new Build with explicit Targets. If execution
has finished but Result storage needs attention, `status` reports the storage problem. The Runtime retries
publication when its execution service starts, without executing generation again.

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

Results live with the project in `.hypit/generation/results` on the machine running Hypit. A local workstation,
an SSH Linux host and the official WebUI backend use the same rule: the whole Runtime moves to that
host instead of splitting its queue, working files and Result storage across services. Archive or
migrate completed Results explicitly after a Build when needed.

Results retain package-declared Outputs as they become available and record the terminal outcome.
A new Output can reference an existing file, including within a composite; it does not necessarily
create new media bytes. Explicit local file references remain live. Keep dependencies available for
future reuse. `result export` creates a separate export when a person or another tool needs one
retained Output.

`builds`, `history`, `inspect` and `result export` read project Results without requiring the original Runtime.
For exact storage and execution interfaces, see the
[Result package](https://github.com/hypit-ai/hypit/blob/main/packages/result/README.md) and
[local Generation Runtime package](https://github.com/hypit-ai/hypit/blob/main/packages/generation-runtime-local/README.md).
