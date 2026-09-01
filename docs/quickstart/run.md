---
title: Run Source & Builds
description: Declaring build targets, reusing results and configuring the runtime.
---

# Run Source & Builds

The Author Source defines the video. A Run Source chooses which of its public outputs to produce and
which explicit Candidates, if any, should satisfy them. The Runtime Profile chooses the machine,
credentials, Provider endpoints and services that execute the resulting plan.

Select the project Runtime once:

```bash
hypit runtime use hypit.runtime.json
```

Ordinary work then follows the short path:

```bash
hypit plan build.svrun
hypit build build.svrun --follow
hypit get <build-id> --name final.video --to output/final.mp4
```

The Quickstart installs the Distribution once. Every command on this page then works as `hypit`
from any independent video project.

Only `build` submits work. `plan` is the normal preview. `check` is an editing aid; `doctor` is a
deployment diagnostic. They are safe to run, but not mandatory ceremony before every Build.

```text
main.svml          author meaning
build.svrun        this Run's Targets and Candidate choices
hypit.runtime.json  execution environment
```

Run Source and Runtime Profile do not silently rewrite the video. Creative model choices remain in
the Author Source or in packages that it explicitly imports.

## Run Source syntax

Every `.svrun` file begins with its processing instruction:

```svml
<?svml using="@hypit/run-markup@1"?>
```

### Minimal Run Source

```svml
<?svml using="@hypit/run-markup@1"?>

<svrun version="1">
  <author source="./main.svml"/>
  <target output="final.video"/>
</svrun>
```

| Element | Description |
|---|---|
| `<svrun>` | Root element. Its only attribute is `version="1"` |
| `<author>` | Mandatory. `source` points to the `.svml` Author Source |
| `<target>` | One demanded public Logical Output |

### Targets

A Target is the Build's final intention, normally the finished video or another real deliverable.
It is not a retention list. The compiler executes only the route needed for the Targets, and every
public Author Output that actually completes on that route is written into the same Build Result.
Internal Operation values remain execution details.

### Multiple targets

You can demand multiple outputs from one Build:

```svml
<target output="final.video"/>
<target output="captions.track"/>
```

Use multiple Targets only when one execution genuinely has several final goals. Different build
intentions should be separate `.svrun` files. They can point to the same Author Source without
duplicating it.

## Reusing results

Hypit has no implicit cache. Reusing a result is explicit Run Graph authoring — you declare one
named Output from one earlier Build Result as a zero-input Candidate and connect it through a
Satisfaction edge.

As soon as a generated image or take is accepted, reuse it explicitly in the next `.svrun` with
`build-record` and `satisfy`, then inspect the plan before starting paid downstream work.

```svml
<?svml using="@hypit/run-markup@1"?>

<svrun version="1">
  <author source="./main.svml"/>
  <target output="final.video"/>

  <build-record id="hook-video"
    build="bld_01234567-89ab-cdef-0123-456789abcdef" output="hook-take.video"/>
  <build-record id="meeting-video"
    build="bld_01234567-89ab-cdef-0123-456789abcdef" output="meeting-take.video"/>
  <build-record id="evidence-video"
    build="bld_01234567-89ab-cdef-0123-456789abcdef" output="evidence-take.video"/>
  <build-record id="payoff-video"
    build="bld_01234567-89ab-cdef-0123-456789abcdef" output="payoff-take.video"/>

  <satisfy output="hook-take.video" candidate="hook-video"/>
  <satisfy output="meeting-take.video" candidate="meeting-video"/>
  <satisfy output="evidence-take.video" candidate="evidence-video"/>
  <satisfy output="payoff-take.video" candidate="payoff-video"/>
</svrun>
```

### Finding reusable output

Query an output name across the project's local Build Results:

```bash
hypit history hook-take.video
```

`history` reports only public Author Outputs that the Build actually produced. It does not list
declared-but-unbuilt outputs or internal Operation values. If the old name is unknown, list Outputs
from Results whose manifest names the exact Author Source path:

```bash
hypit history --source ./main.svml
```

An output name is a human locator inside one Build Result. The pair `build + output` is the exact
address. If the current source renames `hook-take.video` to `opening-shot.video`, keep the old name
on `<build-record>` and use the current name on `<satisfy>`:

```svml
<build-record id="approved-opening"
  build="bld_01234567-89ab-cdef-0123-456789abcdef" output="hook-take.video"/>
<satisfy output="opening-shot.video" candidate="approved-opening"/>
```

Hypit never infers that two names mean the same author intent. Every `build` invocation receives a
fresh Build id and its own Result directory, even when nothing changed. A later Run reuses an Output
only by naming the earlier Build id and Output here. If that earlier Output already forwards to an
older one, resolution follows the explicit chain; no bytes are copied into the new Result.

### build-record

Declares a zero-input Candidate backed by one named Output from a previous Build Result:

| Attribute | Description |
|---|---|
| `id` | Local Candidate id within this Run Source |
| `build` | The automatically assigned id of the previous Build |
| `output` | The Logical Output name from that Build |

### satisfy

Connects a Candidate to a Logical Output:

| Attribute | Description |
|---|---|
| `output` | The Logical Output to satisfy |
| `candidate` | The Candidate id (from `build-record`) |

The compiled plan prunes all upstream Operations that the selected Candidates replace. This is a
new Build, not a continuation of the old one. Downstream processing (normalization, WhisperX,
captioning, rendering) still runs against the reused media.

Core does not label a Candidate as “exact” or “substitute”. Choosing a Candidate is the Run
author's explicit implementation decision for that Build. Type compatibility is checked; creative
equivalence is neither guessed nor carried as redundant metadata through the graph.

### Using an existing file

A local file is the simplest zero-input Candidate. The Run Source names the bytes and connects them
to one current Logical Output:

```svml
<file id="approved-opening" type="@hypit/artifact@1#BlobArtifact" from="./approved-opening.mp4" media-type="video/mp4"/>
<satisfy output="opening-shot.video" candidate="approved-opening"/>
```

The file is read relative to the `.svrun`. If it becomes a completed public Output on the Target
route, it is written into the Build Result like any generated media. There is no hidden history
lookup. A black video, preview image or human-supplied result uses the same mechanism.

## Runtime Profile

The Runtime Profile chooses where Builds execute. It creates named infrastructure instances from
packages selected by logical `use` names, assigns their exported parts to Runtime roles, and
configures Provider endpoints and capacity. It never defines the Source Workspace or Author package
selection.

```bash
hypit runtime use hypit.runtime.json
hypit paths
```

`runtime use` writes only `.hypit/runtime`. It does not start a Worker, create Runtime data or
change installed packages. See [Runtime](../guide/runtime.md) for the Profile schema and boundaries.

## Configure selected credentials

`check` and `plan` never make live Provider requests. A graph-only `plan` without a selected Runtime
needs no deployment credentials; with a selected Runtime, its cheap preflight checks that demanded
credential references are present. Before `doctor` or a paid/external `build`, configure only the
variables referenced by the selected Runtime Profile:

| Variable | Provider/use |
|---|---|
| HypiHub OAuth | HypiHub paid generation and Gemini VLM; run `hypit auth login hypihub.default --runtime hypit.runtime.json` |
| `KIE_API_KEY` | Explicit KIE Provider only |
| `MIMO_API_KEY` | Xiaomi MiMo VoiceDesign, only when the official Endpoint is explicitly selected |

Run only the lines for the Endpoints in your Profile. In macOS/Linux shells:

```bash
read -r -s HYPIHUB_API_KEY
export HYPIHUB_API_KEY
read -r -s KIE_API_KEY
export KIE_API_KEY
read -r -s MIMO_API_KEY
export MIMO_API_KEY
```

In Windows PowerShell:

```powershell
$env:HYPIHUB_API_KEY = "your-key"
$env:KIE_API_KEY = "your-key"
$env:MIMO_API_KEY = "your-key"
```

Keep credentials out of Author Source, Run Source, Runtime Profile source, and committed files.
`doctor` validates required credential presence without printing secret values.

## Build workflow

Keep credentials, generated media, Runtime data and logs out of commits. A project may live anywhere:

```bash
cd /work/my-film
hypit runtime use hypit.runtime.json
```

The Workspace is the selected project or entry Source directory. Override it
only with `--workspace`. `--package-root` locates installed packages and never widens Source access.
`--asset-root` grants read access to additional asset bytes without permitting Source imports there.

```text
.hypit/
  results/
    <build-id>/
      result.json
      files/
      values/
output/
```

That is the zero-configuration Result repository. A Runtime Profile may instead select
`@hypit/build-result-s3`; commands and historical `build-record` references then use that same
repository. Runtime working Artifacts remain local and private to the Runtime.

### 1. Select a Runtime

```bash
cd examples/talking-head-aroll
hypit runtime use hypit.runtime.json
```

Author and Run Sources select their packages through imports. The Runtime Profile selects its Host,
Result repository, credential and Endpoint packages through `use`. The installed package manager
owns their versions.

### 2. Diagnose the environment

```bash
hypit doctor
```

Doctor validates every selected Runtime role, Endpoint configuration, credential
presence and bounded environment probes. It never starts the Worker or performs a paid request.

Doctor is intentionally a **full profile audit**. For the environment required by one Run, use
`plan`: it checks only capabilities demanded by that finite plan. Missing readiness is returned in
`preflight` and gives the command a non-zero exit status, while the frozen plan remains available in
JSON for inspection.

### 3. Check source and inspect the plan

```bash
hypit check main.svml
```

```bash
hypit plan build.svrun
```

Review the frozen BuildPlan before spending money. The plan shows every Operation and Needs the
Scheduler would issue. With a selected Runtime, it also reports only the relevant Endpoint, credential and
external-program diagnostics. It never starts external work.

`plan` may run without a Runtime at all. Both `plan` and `build` may omit `--runtime` after
`hypit runtime use`; `build` requires either that selection or an explicit Profile.

Use `runtime up` to install selected upstream packages, prepare Managed Programs and start the
Worker before submission. `build` repeats only the cheap read-only preflight and refuses before
submission when anything is missing; it never provisions dependencies. `runtime status` observes
the deployment, while `programs up|status|down` is the narrower lifecycle view for long-lived
processes declared by Endpoints.

### 4. Submit the Build

```bash
hypit build build.svrun --name first-cut --follow
```

Without `--follow`, `build` returns after durable submission. The detached Worker continues. With
`--follow`, the terminal is only an observer; it reports durable phase/Operation-count changes and
interrupting it leaves the Build running.

Attach or reattach an observer at any time:

```bash
hypit status <build-id> --watch
```

A plain `status <build-id>` prints one snapshot. `status --watch` exits at terminal state; use
`--max-wait-ms` when a script needs a bounded wait.

| Flag | Description |
|---|---|
| `--runtime` | One-command Runtime Profile override; normally select it once with `runtime use` |
| `--package-root` | Host directory containing the installed packages |
| `--workspace` | Explicit Source Workspace override |
| `--name` | Optional human-facing name for this independent Build |
| `--follow` | Wait for terminal state as an observer; durable execution remains with the Worker |

Each invocation creates a fresh Build id, even when the Author and Run Sources are unchanged. That
is necessary for non-deterministic generation: cross-Build reuse belongs only to explicit Candidates
in a Run Source. While a Build is active, a Worker restart continues its accepted execution facts
and the same external task checkpoints; it never turns another invocation into that Build.

### 5. Inspect and retrieve results

```bash
hypit inspect <build-id>
```

`inspect` reads the project-owned Result directly and lists final Targets plus every completed
public Output saved along their execution route:

```bash
hypit get <build-id> \
  --name final.video \
  --to examples/talking-head-aroll/output/final.mp4
```

`get` resolves one exact `build + output` address and makes an optional copy. A file Output is copied
from that Result; a structured Output is read from its Result value file; a forwarded historical
Output is followed to its declared earlier Result. The Runtime Profile is not involved.

The terminal Build result prints the exact `get --name …` command for every file Target;
there is no need to inspect opaque Record ids just to export `final.video`.

### 6. Reuse in a new Build

Create a new `.svrun` file that references the completed Build's Outputs (see [Reusing results](#reusing-results)
above), then submit it:

```bash
hypit build reuse-generated.svrun --follow
```

### 7. Diagnose or stop the local Runtime

```bash
hypit runtime logs
hypit runtime down
```

`runtime down` stops the Worker from claiming more Builds but leaves external programs running.
Use `programs down` only when those programs should also stop. Neither command cancels durable
Builds or remote Provider work. Starting the same Profile again continues unfinished dispatches.
