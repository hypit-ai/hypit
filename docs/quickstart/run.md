---
title: Run Source & Builds
description: Declaring build targets, reusing results and configuring the runtime.
---

The Author Source defines the video. A Run Source chooses which of its public outputs to produce and
which explicit Candidates, if any, should satisfy them. The official Distribution supplies the Local
Runtime; its Profile names the credentials, Provider Endpoints and services available to execute the
resulting plan.

Select the project Runtime once:

```bash
hypit runtime use hypit.runtime.json
```

Ordinary work then follows the short path:

```bash
hypit plan build.svrun
hypit build build.svrun --follow
hypit get <build-id> --output final.video --to output/final.mp4
```

The Quickstart installs the Distribution once. Every command on this page then works as `hypit`
from any independent video project.

Only `build` submits work. `plan` shows the selected work. `check` is an editing aid; `doctor` is a
deployment diagnostic. They are safe to run, but not mandatory ceremony before every Build.

One convenient layout for a project with several Author, Recipe and Run Sources is:

```text
my-video/
  package.json              project boundary
  authors/
    main.svml               one Author entry
    alternate.svml          another Author entry, when genuinely needed
  recipes/
    visual.svs              authored visual Recipes
    generation.svs          authored generation Recipes
  runs/
    images.svrun            one executable intention
    takes.svrun             another executable intention
    final.svrun             final delivery intention
  assets/                   project-owned input media
  kits/                     optional project-authored Recipe Kits
  packages/                 project-local Author packages when the work introduces them
  output/                   explicit exports for people and other tools
  hypit.runtime.json        execution environment
  .hypit/                   generated local Runtime and Result data
```

This layout is only a human-facing recommendation, never a required project schema. A small project
may keep several `.svml`, `.svs` and `.svrun` files flat at its root, and another project may group
them differently. Hypit uses only the paths written in Source imports, `<author source="…">`, CLI
arguments and `get --to`; it does not require these names or recognize `authors/`, `recipes/`,
`runs/`, `assets/` or `output/` specially. Each Run selects one Author entry, while that Author
Source closure may explicitly import multiple Author or Recipe Sources. The managed Result repository
remains separate under `.hypit/results` by default.

Run Source and Runtime Profile do not silently rewrite the video. Creative model choices remain in
the Author Source or in packages that it explicitly imports.

## Run Source syntax

Every `.svrun` file begins with its processing instruction:

```svml
<?svml using="@hypit/markup/run@1"?>
```

### Minimal Run Source

```svml
<?svml using="@hypit/markup/run@1"?>

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
<?svml using="@hypit/markup/run@1"?>

<svrun version="1">
  <author source="./main.svml"/>
  <target output="final.video"/>

  <build-record id="hook-video"
    build="bld_20260902T142031123Z_0123456789" output="hook-take.video"/>
  <build-record id="meeting-video"
    build="bld_20260902T142031123Z_0123456789" output="meeting-take.video"/>
  <build-record id="evidence-video"
    build="bld_20260902T142031123Z_0123456789" output="evidence-take.video"/>
  <build-record id="payoff-video"
    build="bld_20260902T142031123Z_0123456789" output="payoff-take.video"/>

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

`history` reports only the exact public Author Output requested. It does not list
declared-but-unbuilt outputs or internal Operation values. If the old name is unknown, browse Builds
and inspect the likely Result:

```bash
hypit builds
hypit inspect <build-id>
```

An output name is a human locator inside one Build Result. The pair `build + output` is the exact
address. If the current source renames `hook-take.video` to `opening-shot.video`, keep the old name
on `<build-record>` and use the current name on `<satisfy>`:

```svml
<build-record id="approved-opening"
  build="bld_20260902T110000001Z_0000000001" output="hook-take.video"/>
<satisfy output="opening-shot.video" candidate="approved-opening"/>
```

Hypit never infers that two names mean the same author intent. Every `build` invocation receives a
fresh Build id and its own Result directory, even when nothing changed. A later Run reuses an Output
only by naming the earlier Build id and Output here. If that earlier Output already forwards to an
older one, Result storage resolves that explicit path once and records the new Forward directly to
the finished Result that owns the value; no bytes are copied and no reverse index is maintained.
Forwarding applies only to a complete public Output. Structured JSON cannot recursively point at
another Output; a historical value consumed inside a new Fragment is an ordinary input and the new
Fragment's Output belongs to the current Result. Its nested media still references the original files;
new JSON structure does not require copying the existing images, video or audio.

### build-record

Declares a zero-input Candidate backed by one named Output from a previous Build Result:

| Attribute | Description |
|---|---|
| `id` | Local Candidate id within this Run Source |
| `build` | The automatically assigned id of the previous Build |
| `output` | The public Output name in that Build Result |

### satisfy

Connects a Candidate to a Logical Output:

| Attribute | Description |
|---|---|
| `output` | The Logical Output to satisfy |
| `candidate` | The Candidate id declared by `build-record`, `file`, `value` or a Fragment export |

The Planner reads the complete Author Graph and Run Graph together. It prunes default Operations
that selected Candidates replace while retaining any Author Outputs the selected Candidate itself
still consumes. This is a
new Build, not a continuation of the old one. Reusing generated video leaves normalization and
any required alignment downstream. Reusing normalized media, its local domain and NarrativeAlignment retains those
facts independently without freezing Timeline placement or presentation. Caption, MG and rendering
recompute where they remain on the selected route. Choose the Outputs whose meanings match what should
stay unchanged.

Core does not label a Candidate as “exact” or “substitute”. Choosing a Candidate is the Run
author's explicit implementation decision for that Build. Type compatibility is checked; creative
equivalence is neither guessed nor carried as redundant metadata through the graph.

### Using an existing file

A local file is the simplest zero-input Candidate. The Run Source names the bytes and connects them
to one current Logical Output:

```svml
<file id="approved-opening" type="@hypit/blob@1#Blob" from="./approved-opening.mp4" media-type="video/mp4"/>
<satisfy output="opening-shot.video" candidate="approved-opening"/>
```

The file is read relative to the `.svrun`. If it becomes a completed public Output on the Target
route, the Result records an explicit external-file reference. It does not copy the file into each
new Result. The reference remains live: replacing the file changes subsequent reads, and removing it
makes that dependency unavailable. A supplied image or recorded video uses the same mechanism.

## Runtime Profile

The official video Distribution has already chosen the Local Runtime. Its Profile names the
Credential Stores and Endpoints that local execution may use, together with deployment settings such
as Endpoint capacity. It never selects the Runtime Host or defines the Source Workspace, Author
packages or project Result repository.

```bash
hypit runtime init
hypit paths
```

`runtime init` writes the video Distribution's starter `hypit.runtime.json` and selects it. It refuses
to overwrite an existing file, installs nothing, contacts no service and starts no Worker. For an
existing intentional Profile, use `hypit runtime use <profile>`; that command writes only
`.hypit/runtime`. See [Runtime](../guide/runtime.md) for the Profile schema and boundaries.
The CLI resolves the project first: `--project` is an explicit boundary; otherwise it searches upward
for a `package.json` whose `hypit.project` field is `true`. A component package or arbitrary current
directory never silently becomes a project. It then reads only that project's `.hypit/runtime`. It never discovers
a Profile from a conventional filename or inherits another project's selection from a parent directory.

## Configure selected credentials

`check` and `plan` never make live Provider requests. A graph-only `plan` without a selected Runtime
needs no deployment credentials; with a selected Runtime, its cheap preflight checks that demanded
credential references are present. Before `doctor` or a paid/external `build`, configure only the
credentials referenced by the selected Runtime Profile. First inspect the existing selection:

```bash
hypit auth status hypihub.default
```

If a needed service is not ready, choose whether to configure that service or another supported
local or hosted option. For example, WhisperX can run locally or through HypiHub. A starter Endpoint
is a configuration starting point, not evidence that an account was chosen.

After choosing a service, connect its credential:

For a chosen HypiHub account:

```bash
hypit auth login hypihub.default
```

For another selected Endpoint, use its declared secure input, such as
`hypit auth login images.personal`. Its Provider describes the required credential and its Profile
selects the Store. A project Provider follows the same path. Environment-backed credentials are
set in the Worker environment according to that Provider's configuration.

Keep credentials out of Author Source, Run Source, Runtime Profile source, and committed files.
`doctor` validates required credential presence without printing secret values.

## Read prices for the selected Run

```bash
hypit pricing reference.svrun
hypit pricing reference.svrun --json
```

The selected Runtime determines which Endpoint serves each request. `pricing` reads those Providers'
rate information and groups matching requests, showing known parameters and request counts. Work
explicitly declared local without a Provider charge is summarized; unknown prices, unsupported
requests and failed price reads remain visible. `--verbose` includes the local request details and
original pricing documents.

Use the report to explain the intended spend: the chosen account, planned material, published units
and applicable rates. The command reads prices; it does not submit generation or calculate a guaranteed
total. A future media input may not yet have a known duration, so preserve that uncertainty in the
estimate. JSON keeps request parameters in `groups[].requests` and source material in
`groups[].pricingDocuments`.

Agree on the account, work and budget before paid calls. Existing authorization covers the work
within that agreement; pricing output and successful authentication are information, not approval.

## Build workflow

Keep credentials, generated media, Runtime data and logs out of commits.

### 0. Prepare dependencies on demand

Using the published Hypit executable does not require installing this repository with `pnpm`.
`runtime up` reads the selected Runtime Profile, installs the upstream npm packages its Adapters
declare into a machine-shared directory, and prepares external programs. Project-owned components
and Providers remain ordinary project dependencies, installed with that project's package manager.
[`uv`](https://docs.astral.sh/uv/) is only needed first when the Profile selects local Python
programs such as WhisperX or OpenCV.

The official Distribution supplies the Fontsource adapter. Exact font families are project-owned
dependencies; add them with that project's package manager, for example:

```bash
npm install --save-exact @fontsource-variable/inter@5.3.0
```

`hypit runtime up` prepares the selected Runtime's background Worker, external Programs and runtime
materials; `build` does not perform deployment preparation. npm dependencies are installed beforehand
by the Distribution or project's package manager.

#### Keeping a real video project outside the Hypit checkout

Author files do not have to live under this repository. For example, a project in `/work/my-film`
that reuses packages installed under `/opt/hypit`:

```bash
cd /work/my-film

hypit runtime use hypit.runtime.json
hypit plan build.svrun
```

The Project is resolved before the Runtime Profile. Override it explicitly with `--project`; the
entry Source path and Runtime selection never choose it. `--package-root` locates installed packages
and never widens Source access; `--asset-root` only grants read access to additional asset bytes.

An external project should normally commit this `.gitignore`:

```text
.hypit/
output/
```

The authoritative result of every Build lives in `.hypit/results/<UTC-date>/<build-id>/`:
`result.json` records the name, status, Target and public Outputs, media in `files/`, structured
values in `values/`.

This project-local directory is the Result repository. The `output/` directory shown earlier is only
a convenient destination for explicit exports and is not part of Result storage. Archive or migrate
completed Results after the Build when needed. Temporary Resources for an active Build remain local
and private to the Runtime.

Read-only archive commands such as `status` and `builds` do not initialize the Runtime database when
state does not exist yet.

A shared read-only asset library does not need to be copied into the project, nor does it widen the
Source boundary:

```bash
hypit plan /work/my-film/build.svrun --asset-root /work/shared-media
```

`--asset-root` may be repeated and only grants read access to asset bytes; it never permits importing
`.svml`/`.svs` Source from there. That Host option does not enter author or Build identity; what
actually enters the graph are the explicit Resource values formed from those files.

A Runtime Profile only selects the Credential Store, Endpoints and their closed configuration. The
full structure is maintained in [Runtime](../guide/runtime.md), not duplicated in this Quickstart.

### 1. Select a Runtime

```bash
cd examples/podcast
hypit runtime use hypit.runtime.json
```

Author and Run Sources select their packages through imports. The Local Runtime Profile selects
Credential Store and Endpoint packages through `use`; the project separately owns its Result
repository. The installed package manager owns their versions.

### 2. Diagnose the environment

```bash
hypit doctor
```

Doctor always validates the project's Result repository. When a Runtime Profile is selected or
passed explicitly, it also validates every selected Runtime role, Endpoint configuration, credential
presence and bounded environment probe. It never starts the Worker or performs a paid request.

With a Profile, Doctor checks the whole Profile unless scoped with repeated `--endpoint <instance>`
flags. For the environment required by one Run, use
`plan`: it checks only capabilities demanded by that finite plan. Missing readiness is returned in
`preflight` and gives the command a non-zero exit status, while the frozen plan remains available in
JSON for inspection.

### 3. Check source and inspect the plan

```bash
hypit check reference.svml
```

```bash
hypit plan reference.svrun
```

Review the selected work before spending money. The default plan shows Targets, demanded external
requests and their available parameters; `--verbose` adds graph and Candidate-selection details.
With a selected Runtime, it also reports the relevant Endpoint, credential and
external-program diagnostics. It never starts external work.

`plan` may run without a Runtime at all. Both `plan` and `build` may omit `--runtime` after
`hypit runtime use`; `build` requires either that selection or an explicit Profile.

Use `runtime up` after selecting or changing a Profile to install selected upstream packages,
prepare local Managed Programs and start the local Worker. It does not start or probe remote
Endpoints. Use `doctor` for an active, read-only check of configured remote capabilities. `build`
repeats only the cheap read-only preflight
and refuses before submission when a required package or Program is missing; it never provisions
dependencies. When the deployment is already prepared and only its Worker is stopped, `build`
starts that Worker before durable submission. `runtime status` observes
the deployment, while `programs up|status|down` is the narrower lifecycle view for long-lived
processes declared by Endpoints.

### 4. Submit the Build

```bash
hypit build reference.svrun --title first-cut --follow
```

Without `--follow`, `build` returns after durable submission. The detached Worker continues. With
`--follow`, the terminal is only an observer; it reports durable phase/Operation-count changes and
interrupting it leaves the Build running.

Attach or reattach an observer at any time:

```bash
hypit status <build-id> --watch
```

A plain `status <build-id>` prints one snapshot. `status --watch` exits when the Result has an outcome; use
`--max-wait-ms` when a script needs a bounded wait.

| Flag | Description |
|---|---|
| `--runtime` | One-command Runtime Profile override; normally select it once with `runtime use` |
| `--package-root` | Host directory containing the installed packages |
| `--project` | Explicit Project boundary; also the default Source Workspace root |
| `--title` | Optional human-facing Result title |
| `--follow` | Wait for a Result outcome as an observer; durable execution remains with the Worker |

Each invocation creates a fresh Build id, even when the Author and Run Sources are unchanged. That
is necessary for non-deterministic generation: cross-Build reuse belongs only to explicit Candidates
in a Run Source. Closing an observer leaves the Worker running. Losing a Build's execution context
ends that attempt; restarting the Worker does not resume it. Completed Outputs and recorded task
receipts remain available, and further execution uses a new Build with explicit reuse.

### 5. Inspect and retrieve results

```bash
hypit inspect <build-id>
```

`inspect` reads the project-owned Result directly and shows its Targets, highlighted Outputs and
failure evidence. Use `--output <name>` for one exact Output, or `--verbose` to browse the other Outputs
and execution receipts. `--limit <count>` expands that detailed list. Export a selected Output with:

```bash
hypit get <build-id> \
  --output final.video \
  --to output/final.mp4
```

`get` exports one exact `build + output` address to the required `--to` destination. An `inline`
representation becomes a JSON file. A `file` representation becomes one file containing its original
bytes. A `value-document` representation becomes a self-contained directory: `value.json` holds the
value and file bindings, while the referenced files keep their Result-relative paths inside that
directory. The destination must not already exist.

A forwarded historical Output is resolved transparently to its declared earlier Result. This does
not create a Build, alter a Result or copy anything back into Result storage, and the Runtime Profile
is not involved. Use `inspect` to view an Output; `get` is only explicit local export.

The finished Build result prints the exact `get --output …` command for every file Target;
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

`runtime down` stops the coordinator and its execution processes, leaving Managed Programs running.
Unfinished Builds whose execution contexts end cannot resume when the Worker starts again. Preserve
their completed Outputs and recorded receipts, then use a new Build for further work. Work that was
submitted but never started can still start. Use `programs down` when the separate Programs should
also stop. To cancel a selected Build's remote work, use `hypit cancel <build-id>` while its execution
context is available; stopping local processes does not itself cancel remote Provider tasks.
