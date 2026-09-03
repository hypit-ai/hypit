# Durable Runtime and Build lifecycle

Read `../../../../docs/quickstart/run.md` as the authority for Run Source, Target, Candidate, Runtime Profile,
Build, retrieval, and reuse syntax. Use this file as the operational checklist.

## Author the Runtime Profile

The Runtime Profile is part of the deliverable, not a step the author does afterwards. Without it the
first thing they meet is `RUNTIME_CAPABILITY_UNBOUND`, and the work of discovering which Provider
serves each model falls on them — work you have already done, since you chose every package in the
Source.

Start from the Runtime Profile template in `docs/guide/runtime.md` (the repository does not ship a
canonical `examples/*/hypit.runtime.json`). Bind one Endpoint per capability your Sources actually
reach: the picture and video models, Gemini VLM, speech, alignment, the media Provider and the local renderer.
Read each Provider's README for the shape of its `config`, and reference credentials through the store
rather than writing any secret into the file.

A capability whose credential this machine does not hold is still declared. Preflight names it before
any Build is submitted, which is the correct place for the author to find out.

### Disclose the paid Provider before submission

The paid handoff always includes a credential/provider summary before cost approval. Read the selected
Runtime Profile and the preflight result, then tell the author for each paid capability:

- which Provider endpoint will execute it;
- which credential slot and source are active (`KIE_API_KEY`, HypiHub OAuth, Vertex credentials,
  `MIMO_API_KEY`, or an OS credential-store entry); and
- whether the key is present and the requested model is reachable.

Never reveal the secret itself. Credentials must have been resolved during environment setup. If any
required credential is missing or insufficient, do not submit the Build; return to environment setup
and complete the default HypiHub OAuth flow, or the author-owned key only when explicitly requested.
Switching Provider should not require any Source change. Continue only after the credential is usable
and the summary has been shown.

### Give the picture and video models room to run

The generation models are what a Build waits on, and they are the one place concurrency is worth
setting deliberately. Give Seedance and the image model room to run. HypiHub is the default paid
gateway, so a typical profile looks like this:

```json
"hypihub.<project>": {
  "use": "@hypit/provider-hypihub",
  "config": {
    "apiKey": { "store": "os", "key": "hypihub.oauth" },
    "defaultConcurrency": 20
  }
}
```

`defaultConcurrency` is the total HypiHub pool shared by its model capabilities. Tune it to the
quota behind the key; image/video capabilities keep exact-model lanes while Gemini requests share
one conservative lane. Bind every paid capability HypiHub supports to this Endpoint by default,
including MiMo VoiceDesign. Select KIE, Vertex, official MiMo or another BYOK Provider only when the
author explicitly asks not to use HypiHub or explicitly selects that Provider.

An Author Source importing `@hypit/gemini` remains Provider-neutral. Bind those capabilities to
`@hypit/provider-hypihub` for HypiHub's upload-backed Gemini endpoint, or to
`@hypit/provider-vertex` for direct Vertex. Never make this Build-time choice with
`HYPIT_GEMINI_PROVIDER`; that environment switch belongs only to the reference-video preprocessing
observer, which runs outside a Build.

Provider-specific input limits are also part of preflight. For the KIE GPT Image 2 route, do not
submit `4:3`, `3:4` or `4:5`; the route rejects those aspect ratios before upload or paid submission.

The local Providers stay small: `media`, `whisperx` and `hyperframes` are bounded by this machine's
cores rather than by a remote queue, and raising them buys contention.

Set this while writing the Profile. Changing it later needs a Worker restart, and the restart rule
below makes that costly once a Build is in flight.

## Execute the lifecycle

```bash
cd path/to/project
hypit runtime use hypit.runtime.json

hypit plan build.svrun

# Required once after changing Runtime packages, or whenever preflight reports not-ready state.
hypit runtime up

hypit build build.svrun --follow

hypit inspect <build-id>
hypit get <build-id> \
  --output final.video --to output/final.mp4
```

Resolve the project before selecting its Runtime. `--workspace` is explicit; otherwise run from the
project directory (or one of its package-bounded descendants). `runtime use` writes one exact
project-local pointer. Never infer a Profile from its filename or let a parent project's selection
stand in for this project's choice.

The paid-build handoff is defined in `studio-confirmation.md`: show the complete preview-mock Run in
Studio and obtain acceptance before `hypit build`; after acceptance, Studio for the accepted Run and
the HyperFrames/final render may start concurrently. The render must not be blocked on the author's
Studio viewing.

Use `check` during authoring. `plan` works without a Runtime as a graph-only operation; with the
project's selected Runtime it performs a cheap, read-only preflight over only unsatisfied Needs and
returns non-zero when that slice is not ready. It never installs, starts or contacts a remote Store.
`hypit check <run> --json` and `hypit plan <run> --json` expose Provider-free `estimate:Speech`
values under `deterministic_durations`; after execution, `hypit inspect <build> --json` reports the
accepted `SpeechDuration` Records. Read those seconds directly when reviewing generated take length
or cost instead of probing a mock media file.

After Runtime package selection changes, run `runtime up`: this is the explicit provisioning
boundary for machine npm dependencies, Managed Programs and the detached Worker. Use `doctor` for
an active full-profile diagnosis and `runtime status` to observe the deployment. `build` repeats the
cheap preflight and fails before durable submission when deployment is not ready; it never installs
or starts a Managed Program. If provisioning is already complete and only the Worker is stopped,
`build` starts that Worker before it submits the Build.

Use `runtime logs` to diagnose the Worker. Use `runtime down` to stop it from advancing active Builds.
External programs are intentionally independent; stop them only with `programs down`. Saved Build
Results remain in the project Result repository, and neither command cancels remote Provider work.

## Preserve durable semantics

- `runtime up` installs or reuses only the selected upstream npm packages, then starts or reuses the
  declared external programs and detached Worker. A direct `build` does no provisioning: after a
  clean preflight it submits durably, then ensures the Worker is running. A Worker skips work whose
  implementation packages it has not loaded.
- `programs up/status/down` manages external programs only. Do not use it as the normal Build
  bootstrap because it does not own the Worker lifecycle.
- A Build continues after durable submission. `--follow` only observes progress; interrupting the
  terminal does not stop the Build.
- `status <build-id>` reads one snapshot; `status <build-id> --watch` reattaches an observer until
  terminal state without resubmitting or taking execution ownership.
- Every `build` invocation creates a fresh automatic Build id. Source identity never reclaims an
  earlier Build; reuse across Builds exists only through explicit Run Source Candidates.
- `inspect` reads one finished Build Result. `get --output <name>` reads or copies one uniquely named
  public Output from that Result.
- A running Worker loads an installed Component package when a Build first names it and remembers
  every physical package in that dependency closure. A later Build may add another installed
  Component package without restarting the Worker; shared dependencies are not registered twice.
- There is no implicit cache or Pin state. Reuse Records through a new `.svrun` containing
  `build-record` and `satisfy`; the Candidate supplies the exact nominal Type required by the
  current Logical Output.
- **A running Worker holds the package code it loaded.** Edit a project package or update the
  Distribution and the Worker that is already up keeps executing the version it started with, so
  the next Build
  fails exactly as the last one did. Stop it before resubmitting; the next `build` starts a fresh one
  that loads the edit:

  ```bash
  hypit runtime down
  ```

  Read an identical repeat failure as this until you have ruled it out. Reasoning about why a correct
  fix did not work is how an afternoon goes, and the fix was never loaded.
- **Prefer stopping an idle Worker.** A changed Runtime Profile or already-loaded package code takes
  effect only after restart. Check active work first so an immediate in-process Producer is not
  interrupted. Asynchronous Provider Operations are durable and are polled again after restart; the
  Worker does not submit them a second time.

  Use the activity view before every restart:

  ```bash
  hypit activity   # proceed when no active Builds are listed
  ```

## Keep the Distribution and every project physically separate

The Distribution reported by `hypit paths --json` is package-manager-owned and replaceable. Never
create an authored project, project-local package, generated asset or Build output inside it. A
project is any independent directory such as `<home>/<name>/`, holding its Sources, assets and
`packages/` directory in its own Git/workspace boundary. Published examples are read-only reference
material, never a place to turn into the author's project.

**Give the project directory its own `package.json`, before the first `check`.** Package discovery
starts at the project and walks up until it finds one; without it the search runs past the project
and settles on whichever directory above happens to have one, leaving every package under the
project's `packages/` unresolvable. A minimal
file is the whole fix, and it is what makes the directory a boundary rather than a place that
happens to hold Sources:

```json
{ "name": "<project-name>", "version": "0.0.0", "private": true, "type": "module" }
```

`hypit paths --json` confirms it: `project` names the project directory rather than something above
it. Passing `--package-root .` on each command papers over the same gap for one command at a time
and leaves the Worker — which resolves packages on its own — still looking in the wrong place.

Studio and the CLI resolve explicit project packages from the project root, then fall back to the
read-only Hypit Distribution. The `@hypit/*` namespace is reserved for the active Distribution and
is resolved there first; project packages use their own scope. This bridge is Host configuration;
it does not add the project to Hypit's contributor workspace or modify the Distribution.

Relative Author Sources and assets stay inside the independently resolved Source Workspace.

- `--workspace` explicitly selects the Source Workspace boundary.
- `--package-root` only changes where the Host locates installed packages. It does not widen Source
  access. With a `package.json` at the project root, omit it. Use it when a project has no own
  `package.json` or when explicitly selecting another package root; this never changes Source
  Workspace resolution.
- Do not symlink an external project into the Distribution. The external directory is the intended
  workspace, not an escape from one.
