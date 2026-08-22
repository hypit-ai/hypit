# Durable Runtime and Build lifecycle

Read `docs/quickstart/run.md` as the authority for Run Source, Target, Candidate, Runtime Profile,
Build, retrieval, and reuse syntax. Use this file as the operational checklist.

## Author the Runtime Profile

The Runtime Profile is part of the deliverable, not a step the author does afterwards. Without it the
first thing they meet is `RUNTIME_CAPABILITY_UNBOUND`, and the work of discovering which Provider
serves each model falls on them — work you have already done, since you chose every package in the
Source.

Copy the nearest existing `examples/*/hypit.runtime.json` and bind one Endpoint per capability your
Sources actually reach: the picture and video models, speech, alignment, the media Provider and the
local renderer. Read each Provider's README for the shape of its `config`, and reference credentials
through the store rather than writing any secret into the file.

A capability whose credential this machine does not hold is still declared. Preflight names it before
any Build is submitted, which is the correct place for the author to find out.

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
- **A running Worker holds the package code it loaded.** Edit a package — yours or an installed one —
  and the Worker that is already up keeps executing the version it started with, so the next Build
  fails exactly as the last one did. Stop it before resubmitting; the next `build` starts a fresh one
  that loads the edit:

  ```bash
  ps -eo pid,command | grep "hypit.mjs _worker" | grep <project>/hypit.runtime.json
  kill <pid>
  ```

  Read an identical repeat failure as this until you have ruled it out. Reasoning about why a correct
  fix did not work is how an afternoon goes, and the fix was never loaded.
- **Stop the Worker between Builds, never during one.** A remote generation belongs to the Provider,
  and the Worker is the only thing watching it: take the Worker down mid-flight and the request keeps
  running with nobody to collect it, passes its operation deadline, and fails — taking the whole Build
  with it, not merely the requests that were in the air. `runtime status` reports what is queued,
  running and reserved; wait for it to report nothing before stopping anything. This applies to the
  Profile as much as the code — raising an Endpoint's `defaultConcurrency` needs the same restart, so
  a change that costs nothing on an idle Runtime costs the whole Build on a busy one. Nothing is lost
  by waiting: accepted Records are durable, and the requests still in flight are the expensive ones.

## Keep the tool checkout and every project physically separate

The printed Hypit repository is a replaceable tool checkout. Never create an authored project,
project-local package, generated asset or Build output inside it. A project is a sibling or otherwise
external directory such as `<home>/<name>/`, holding its Sources, assets and `packages/` directory in
its own Git/workspace boundary. `examples/` is only the published fixture set: read it for the nearest
Runtime Profile and source shape, but never turn an example or a hidden checkout directory into the
author's project.

Studio and the CLI resolve explicit project packages from the project root, then fall back to the
read-only Hypit Distribution. The `@hypit/*` namespace is reserved for the active Distribution and
is resolved there first; project packages use their own scope. This bridge is Host configuration;
it does not add the project to Hypit's pnpm workspace or modify either repository's lockfile.

Relative Author Sources and assets stay inside the independently resolved Source Workspace.

- `--workspace` explicitly selects the Source Workspace boundary.
- `--package-root` only changes where the Host locates installed packages. It does not widen Source
  access.
- Do not symlink an external project into the repository. The external directory is the intended
  workspace, not an escape from one.
