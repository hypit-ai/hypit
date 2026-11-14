# `@hypit/cli`

The domain-neutral command Host for Hypit applications.

This package owns terminal I/O, root-command dispatch, help routing, project-context resolution,
error presentation and the structural CLI command module surface. It does not own compilation, Runtime,
Results, media import, NLE export or any other product vocabulary. An executable chooses those
capabilities by assembling command modules explicitly.

```ts
import { runNodeCliApplication } from "@hypit/cli";
import { createSourceBuildCliCommandModules } from "@hypit/build-cli";
import { createBuildOperationsCliCommandModules } from "@hypit/build-operations-cli";
import { createLocalExecutionEnvironmentCliCommandModules } from "@hypit/execution-environment-local/cli";
import { createLocalRuntimeCliCommandModules } from "@hypit/generation-runtime-local/cli";

await runNodeCliApplication(process.argv.slice(2), {
  commandModules: [
    ...createSourceBuildCliCommandModules(sourceBuildServices),
    ...createBuildOperationsCliCommandModules(buildOperationsServices),
    ...createLocalExecutionEnvironmentCliCommandModules(localEnvironment),
    ...createLocalRuntimeCliCommandModules(localRuntime),
  ],
});
```

Each module declares the root commands it owns. The Host rejects duplicate roots and reserves only
the generic `help` command; it neither guesses a command owner nor falls back to a built-in product
command. `CliApplicationContext` contains only invocation facts shared by every module: the current
directory and project-root resolution.

This is application assembly, not workflow execution. A Distribution may assemble `project`, `media`,
`nle`, `workbench`, `runtime` and other roots into one `hypit` executable. Subcommands such as
`nle frames`, `nle review` and `nle export` remain one NLE module because they share one domain-facing
local application port. A module must not call another module's `run()` method or treat terminal text
as an in-process service boundary. When several operations need one snapshot, resource store or Programme,
an application service composes their typed functions first and the CLI projects that combined operation.

Process-level orchestration may sequence commands through their documented `--json` outputs. Final machine
results use stdout and progress uses stderr, so composition does not require scraping human progress text.
Stateful authoring sessions use their Application Service through Agent Tool, Desktop IPC or HTTP instead of
repeated CLI invocations that each reopen the document.

## Installed command modules

The official executable may bind trusted modules directly. A project may additionally select an
installed npm export through its own `package.json`:

```json
{
  "devDependencies": { "@someone/hypit-cloud": "1.2.3" },
  "hypit": { "cli": { "use": ["@someone/hypit-cloud/cli"] } }
}
```

The selected export exposes a non-empty `cliCommandModules` array of command modules.
`hypit cli use/remove/status` changes or reports only that explicit selection. It never installs,
upgrades, scans for or executes undeclared packages; the ordinary package manager and lockfile own
physical installation and versions. Importing a package from a Source does not grant CLI authority.

Distribution selections resolve from the executable's installation. Project selections must be
direct project dependencies and resolve from that project. All selected modules still pass the same
root-ownership checks before any command runs.

## Presentation boundary

`runNodeCli` provides the Node terminal adapter. Standard output contains the final human or machine
result; progress uses standard error. Shared output helpers keep `--json`, `--jsonl`, color, usage
errors and debug traces consistent without putting domain services into the Host.

Source compilation commands live in [`@hypit/build-cli`](../build-cli/README.md); accepted-Build and
Result operations live in `@hypit/build-operations-cli`. Execution Environment, Generation Runtime, media and NLE commands are package-owned
`./cli` exports assembled by the executable. A separate `*-cli` package is reserved for an application adapter
whose command spans independently reusable domains or would otherwise reverse a dependency into its host; the
command ABI does not make every terminal entry a new distribution unit.
