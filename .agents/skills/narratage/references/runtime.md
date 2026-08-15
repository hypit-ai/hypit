# Durable Runtime and Build workflow

Read `docs/quickstart/run.md` as the authority for Run Source, Target, Candidate, Runtime Profile,
Build, retrieval, and reuse syntax. Use this file as the operational checklist.

## Execute the lifecycle

```bash
cd path/to/project
node --run narratage -- runtime use svml.runtime.json

node --run narratage -- plan build.svrun

node --run narratage -- build build.svrun --follow

node --run narratage -- inspect <build-id>
node --run narratage -- get <build-id> \
  --name final.video --to output/final.mp4
```

Use `packages sync` only after package selection changes. Use `check` during authoring and `doctor`
or `runtime status` when diagnosing the deployment. `build` already ensures the detached Worker
and demanded managed services are available.

Use `runtime logs` to diagnose the Worker. Use `runtime down` to stop it from claiming more leases.
External programs are intentionally independent; stop them only with `services down`. Durable
Builds remain archived and neither command cancels remote Provider work.

## Preserve durable semantics

- `runtime up` starts or reuses the detached Worker plus declared external programs. A direct
  `build` also ensures the execution domain is running before submission.
- `services up/status/down` manages external programs only. Do not use it as the normal Build
  bootstrap because it does not own the Worker lifecycle.
- A Build continues after durable submission. `--follow` only observes progress; interrupting the
  terminal does not stop the Build.
- Every `build` invocation creates a fresh automatic Build id. Source identity never reclaims an
  earlier Build; reuse across Builds exists only through explicit Run Source Candidates.
- `inspect` reads durable Build state and accepted Records. `get` copies an archived Artifact to the
  requested destination.
- There is no implicit cache or Pin state. Reuse Records through a new `.svrun` containing
  `build-record` and `satisfy`; the Candidate supplies the exact nominal Type required by the
  current Logical Output.

## Keep project and package boundaries distinct

Prefer production projects outside the Narratage checkout. Relative Author Sources and assets stay
inside the Source Workspace, which defaults to the directory containing the entry `.svrun`.

- `--root` deliberately widens the Source Workspace boundary.
- `--package-root` only changes where the Host locates installed packages whose bytes are verified
  by the package lock. It does not widen Source access.
- Do not symlink an external project into the repository to bypass containment; canonical-path
  checks reject that escape.
