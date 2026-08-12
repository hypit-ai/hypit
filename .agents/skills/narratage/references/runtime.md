# Durable Runtime and Build workflow

Read `docs/quickstart/run.md` as the authority for Run Source, Target, Candidate, Runtime Profile,
Build, retrieval, and reuse syntax. Use this file as the operational checklist.

## Execute the lifecycle

```bash
node --run narratage -- plan path/to/build.svrun \
  --runtime path/to/svml.runtime.json

node --run narratage -- build path/to/build.svrun \
  --runtime path/to/svml.runtime.json \
  --build-id my-build-001 --follow

node --run narratage -- inspect my-build-001 --runtime path/to/svml.runtime.json
node --run narratage -- get my-build-001 \
  --runtime path/to/svml.runtime.json \
  --name final.video --to path/to/output/final.mp4
```

Use `packages sync` only after package selection changes. Use `check` during authoring and `doctor`
or `runtime status` when diagnosing the deployment. `build` already ensures the detached Worker
and demanded managed services are available.

Use `runtime logs` to diagnose the Worker and managed programs. Use `runtime down` for an orderly
stop. It stops the Worker from claiming more leases and stops Runtime-owned programs, but preserves
durable Builds and does not cancel remote Provider work.

## Preserve durable semantics

- `runtime up` starts or reuses the detached Worker plus declared external programs. A direct
  `build` also ensures the execution domain is running before submission.
- `services up/status/down` manages external programs only. Do not use it as the normal Build
  bootstrap because it does not own the Worker lifecycle.
- A Build continues after durable submission. `--follow` only observes progress; interrupting the
  terminal does not stop the Build.
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
