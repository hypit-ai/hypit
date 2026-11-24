# Installations, Hosts, and Reuse

Read this to locate or install the `hypit` executable, inspect running local Hosts, or reuse
existing tools and project outputs.

## Keep three lifecycles separate

| Part | What it supplies | Where changes belong |
| --- | --- | --- |
| Hypit Skill | Production judgment, directing craft, and navigation | The Skill's installation |
| `@hypit/hypit` executable | CLI, ApplicationHost, ExecutionHost, and bundled core packages | npm / Desktop installation |
| Video project | `hypit.project.json`, `*.canvas.json`, `*.svml`, `media/`, `packages/` | Project files and lockfile |

## Check the active installation and Hosts

```bash
hypit --version
hypit --help
hypit host status
hypit execution status
```

- `hypit host start [--port <n>] [--endpoint-file <file>] [--execution-endpoint-file <file>]`:
  starts the local **ApplicationHost** (serves `project`, `nle`, `canvas`, and Studio sessions).
- `hypit execution start [--port <n>] [--data-root <dir>] [--endpoint-file <file>]`:
  starts the local **ExecutionHost** (serves `auth`, `execution`, and recoverable Invocations).
- Ordinary CLI commands (`project`, `nle`, `canvas`, `auth`, `execution`) automatically attach to
  or start the default Host on demand. Use `--endpoint-file <file>` to target an explicit Host.

## Install `@hypit/hypit`

```bash
npm install --global @hypit/hypit
# or project-local:
pnpm add -D @hypit/hypit
```

In Hypit Desktop, the bundled `hypit` shim is already on `PATH` and wired to the Desktop-managed
ApplicationHost and ExecutionHost.

## Reuse what already serves the production

- **Executable & Hosts**: reuse the active `hypit` installation and running Hosts across projects.
- **Account & credentials**: reuse the connected Environment through `hypit auth status`.
- **Publications**: completed Invocations in ExecutionHost remain addressable; select and adopt
  existing Publications in Canvas rather than regenerating unchanged material.
- **Project packages**: keep installed versions locked in `package.json` and `pnpm-lock.yaml`.
