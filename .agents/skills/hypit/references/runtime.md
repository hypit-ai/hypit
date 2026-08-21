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

### Give the picture and video models room to run

The generation models are what a Build waits on, and they are the one place concurrency is worth
setting deliberately. Give Seedance and the image model **10 each**.

On a Provider with per-model lanes — `@hypit/provider-kie` is the usual one — that is a lane apiece
inside a pool wide enough to hold both, so neither starves the other:

```json
"kie.<project>": {
  "use": "@hypit/provider-kie",
  "config": {
    "apiKey": { "store": "env", "key": "KIE_API_KEY" },
    "defaultConcurrency": 20,
    "laneConcurrency": { "seedance-2-mini": 10, "gpt-image-2": 10 }
  }
}
```

`defaultConcurrency` is the total pool shared by every lane, so it has to be at least the sum of the
lanes or the lane numbers are a ceiling nothing reaches. Name the lane by the exact capability the
Source reaches — `seedance-2-mini` and `gpt-image-2` above — since a lane key that matches no
capability is silently inert. Read the Provider's README for the lane names it admits.

The local Providers stay small: `media`, `whisperx` and `hyperframes` are bounded by this machine's
cores rather than by a remote queue, and raising them buys contention.

Set this while writing the Profile. Changing it later needs a Worker restart, and the restart rule
below makes that costly once a Build is in flight.

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

## Keep project and package boundaries distinct

A project lives at `projects/<name>/` in the checkout — its own directory, holding the four Sources,
its assets and any project-local package. `pnpm-workspace.yaml` covers `projects/*/packages/*` and
Git ignores `projects/`, so a project is installed and type-checked like the examples while staying
out of the repository's history.

`examples/` is the published example set. Read it for the nearest Runtime Profile and the closest
source shape, and write under `projects/`.

Relative Author Sources and assets stay inside the independently resolved Source Workspace.

- `--workspace` explicitly selects the Source Workspace boundary.
- `--package-root` only changes where the Host locates installed packages. It does not widen Source
  access.
- Do not symlink an external project into the repository to bypass containment; canonical-path
  checks reject that escape.
