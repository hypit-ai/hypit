# Durable Runtime and Build workflow

Read `docs/quickstart/run.md` as the authority for Run Source, Target, Candidate, Runtime Profile,
Build, retrieval, and reuse syntax. Use this file as the operational checklist.

## Execute the lifecycle

```bash
cd path/to/project
hypit runtime use hypit.runtime.json

hypit plan build.svrun

hypit build build.svrun --follow

hypit inspect <build-id>
hypit get <build-id> \
  --name final.video --to output/final.mp4
```

Install dependencies after package selection changes. Use `check` during authoring and `doctor`
or `runtime status` when diagnosing the deployment. `build` already ensures the detached Worker
and demanded Managed Programs are available.

Use `runtime logs` to diagnose the Worker. Use `runtime down` to stop it from claiming more Builds.
External programs are intentionally independent; stop them only with `programs down`. Durable
Builds remain archived and neither command cancels remote Provider work.

## Preserve durable semantics

- `runtime up` starts or reuses the detached Worker plus declared external programs. A direct
  `build` durably submits first, then ensures a Worker containing every queued Build's implementation
  packages is running. A Worker skips work whose packages it has not loaded.
- `programs up/status/down` manages external programs only. Do not use it as the normal Build
  bootstrap because it does not own the Worker lifecycle.
- A Build continues after durable submission. `--follow` only observes progress; interrupting the
  terminal does not stop the Build.
- `status <build-id>` reads one snapshot; `status <build-id> --watch` reattaches an observer until
  terminal state without resubmitting or taking execution ownership.
- Every `build` invocation creates a fresh automatic Build id. Source identity never reclaims an
  earlier Build; reuse across Builds exists only through explicit Run Source Candidates.
- `inspect` reads durable Build state and accepted Records. `get` copies an archived Artifact to the
  requested destination.
- There is no implicit cache or Pin state. Reuse Records through a new `.svrun` containing
  `build-record` and `satisfy`; the Candidate supplies the exact nominal Type required by the
  current Logical Output.

## Keep project and package boundaries distinct

Prefer production projects outside the Hypit checkout. Relative Author Sources and assets stay
inside the independently resolved Source Workspace.

- `--workspace` explicitly selects the Source Workspace boundary.
- `--package-root` only changes where the Host locates installed packages. It does not widen Source
  access.
- Do not symlink an external project into the repository to bypass containment; canonical-path
  checks reject that escape.
