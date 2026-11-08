# `@hypit/cli`

The domain-neutral command Host for Hypit applications.

This package owns terminal I/O, root-command dispatch, help routing, project-context resolution,
error presentation and the `hypit.cli-command@1` module ABI. It does not own compilation, Runtime,
Results, media import, NLE export or any other product vocabulary. An executable chooses those
capabilities by assembling command modules explicitly.

```ts
import { runNodeCliApplication } from "@hypit/cli";
import {
  createBuildOperationsCliCommandModules,
  createSourceBuildCliCommandModules,
} from "@hypit/build-cli";
import { createLocalRuntimeCliCommandModules } from "@hypit/runtime-local-cli";

await runNodeCliApplication(process.argv.slice(2), {
  commandModules: [
    ...createSourceBuildCliCommandModules(sourceBuildServices),
    ...createBuildOperationsCliCommandModules(buildOperationsServices),
    ...createLocalRuntimeCliCommandModules(localRuntime),
  ],
});
```

Each module declares the root commands it owns. The Host rejects duplicate roots and reserves only
the generic `help` command; it neither guesses a command owner nor falls back to a built-in product
command. `CliApplicationContext` contains only invocation facts shared by every module: the current
directory and project-root resolution.

## Installed command modules

The official executable may bind trusted modules directly. A project may additionally select an
installed npm export through its own `package.json`:

```json
{
  "devDependencies": { "@someone/hypit-cloud": "1.2.3" },
  "hypit": { "cli": { "use": ["@someone/hypit-cloud/cli"] } }
}
```

The selected export exposes a non-empty `cliCommandModules` array of `hypit.cli-command@1` values.
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

Long-compilation commands and their detailed reporting rules live in
[`@hypit/build-cli`](../build-cli/README.md). Local Runtime, media and NLE commands are separate
adapters assembled by the executable.
