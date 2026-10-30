---
title: Targets & Builds
description: Declaring build targets, reusing results and configuring the runtime.
---

The Author Source defines the video. Each `plan`, `pricing`, `build` or Studio command explicitly
chooses which author Outputs to evaluate as Targets. The official Distribution supplies the Local Runtime; its Profile names the
credentials, Provider Endpoints and services available to execute the resulting plan.

Select the project Runtime once:

```bash
hypit runtime use hypit.runtime.json
```

Ordinary work then follows the short path:

```bash
hypit plan main.svml --target final.video
hypit build main.svml --target final.video --follow
hypit result export <build-id> --output final.video --to output/final.mp4
```

The Quickstart installs the Distribution once. Every command on this page then works as `hypit`
from any independent video project.

Only `build` submits work. `plan` shows the selected work. `check` is an editing aid; `doctor` is a
deployment diagnostic. They are safe to run, but not mandatory ceremony before every Build.

One convenient layout for a project with several Author and Recipe Sources is:

```text
my-video/
  package.json              project boundary
  authors/
    main.svml               one Author entry
    alternate.svml          another Author entry, when genuinely needed
  recipes/
    visual.svs              authored visual Recipes
    generation.svs          authored generation Recipes
  assets/                   project-owned input media
  kits/                     optional project-authored Recipe Kits
  packages/                 project-local Author packages when the work introduces them
  output/                   explicit exports for people and other tools
  hypit.runtime.json        execution environment
  .hypit/                   generated local Runtime and Result data
```

This layout is only a human-facing recommendation, never a required project schema. A small project
may keep several `.svml` and `.svs` files flat at its root, and another project may group
them differently. Hypit uses only the paths written in Source imports and CLI
arguments and `result export --to`; it does not require these names or recognize `authors/`, `recipes/`,
`assets/` or `output/` specially. An Author Source closure may explicitly import multiple Author or Recipe Sources. The managed Result repository
remains separate under `.hypit/results` by default.

Target selection and Runtime Profile do not silently rewrite the video. Creative model choices remain in
the Author Source or in packages that it explicitly imports.

## Targets

A Target is the Build's final intention, normally the finished video or another real deliverable.
The Build produces the work needed for its Targets. A Target controls evaluation; it does not by itself
store that value in the Result. Package-owned generated media, editable evidence and encoded final outputs
declare their own cross-Build lifetime. Derived Track, Timeline and PreparedMedia values remain graph values.

### Multiple Targets

You can demand multiple outputs from one Build:

```bash
hypit plan main.svml \
  --target final.video \
  --target captions.track
```

Use multiple Targets only when one execution genuinely has several final goals. The Source path and
Targets are explicit command inputs. A project can use its ordinary task runner for a frequently
repeated long command; Hypit does not define a Target file, registry or inferred default.

## Reusing produced work

Build Results are execution history. When an Output should become durable project material, locate
the exact Output and export it into the project:

```bash
hypit history opening-generation.video
hypit inspect <build-id>
hypit result export <build-id> --output opening-generation.video --to assets/opening.mp4
```

Declare the exported file with the Author package that owns its meaning, then make the consumer
reference that authored Record:

```svml
<import as="asset" from="@hypit/media@1"/>
<import as="mediaop" from="@hypit/media-operations@1"/>

<asset:Video id="accepted-opening" src="./assets/opening.mp4"/>
<mediaop:Prepare id="opening-media" source={accepted-opening}
  video="primary-moving" audio="default" span-authority="video"/>
```

This is a durable production edit. Captions, Timeline placement, visual treatment and rendering use
the accepted performance without teaching Target selection or Result how that file originated. Camera
footage, a download, a CLI-produced file and a generated Result enter through the same Author
declaration. To generate another take, target `opening-generation.video`; adopting that take is a
separate explicit edit of the consumer reference.

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

`check` and `plan` never make live Provider requests. A `plan` without a selected Runtime
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

Keep credentials out of Author Source, Runtime Profile source, and committed files.
`doctor` validates required credential presence without printing secret values.

## Read prices for the selected Targets

```bash
hypit pricing reference.svml --target final.video
hypit pricing reference.svml --target final.video --json
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
hypit plan main.svml --target final.video
```

The Project is resolved before the Runtime Profile. Override it explicitly with `--project`; the
entry Source path and Runtime selection never choose it. `--package-root` locates installed packages
and never widens Source access; `--asset-root` only grants read access to additional asset bytes.

An external project should normally commit this `.gitignore`:

```text
.hypit/
output/
```

The authoritative result of every Build lives in the project Result repository under `.hypit/results`.
It records the outcome and Targets, execution evidence and the retained Outputs that actually completed.
Its physical file layout is repository-private.

This project-local directory is the Result repository. The `output/` directory shown earlier is only
a convenient destination for explicit exports and is not part of Result storage. Archive or migrate
completed Results after the Build when needed. Temporary Resources for an active Build remain local
and private to the Runtime.

Read-only archive commands such as `status` and `builds` do not initialize the Runtime database when
state does not exist yet.

A shared read-only asset library does not need to be copied into the project, nor does it widen the
Source boundary:

```bash
hypit plan /work/my-film/main.svml --target final.video --asset-root /work/shared-media
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

Author Sources select their packages through imports. The Local Runtime Profile selects
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
flags. For the environment required by explicit Targets, use
`plan`: it checks only capabilities demanded by that finite plan. Missing readiness is returned in
`preflight` and gives the command a non-zero exit status, while the frozen plan remains available in
JSON for inspection.

### 3. Check source and inspect the plan

```bash
hypit check reference.svml
```

```bash
hypit plan reference.svml --target final.video
```

Review the selected work before spending money. The default plan shows Targets, demanded external
requests and their available parameters; `--verbose` adds demanded deployment capabilities and
successful diagnostics. The report does not expose Producer graph connections.
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
hypit build reference.svml --target final.video --follow
```

Without `--follow`, `build` returns after durable submission. The detached Worker continues. With
`--follow`, the terminal is only an observer; it reports durable progress changes and
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
| `--follow` | Wait for a Result outcome as an observer; durable execution remains with the Worker |

Each `build` command creates a fresh Build id, even when the Author Source and Targets are unchanged. Closing
an observer leaves the Worker running. Losing a Build's execution context ends that attempt;
restarting the Worker does not resume it. Completed Outputs and recorded task receipts remain
available. Accept useful material by exporting it into the project and updating the Author Source.

### 5. Inspect and retrieve results

```bash
hypit inspect <build-id>
```

`inspect` reads the project-owned Result directly and shows its Targets, retained Outputs and
failure evidence. Use `--output <name>` for one exact Output, or `--verbose` to add Output details
and execution receipts. `--limit <count>` bounds the retained Output list. Export one Output with:

```bash
hypit result export <build-id> \
  --output final.video \
  --to output/final.mp4
```

`result export` writes one exact retained `build + output` address to the required `--to` destination.
An inline scalar becomes JSON and a file Output keeps its original bytes. A structured Output is written
in the author format defined by the package that owns its Type; if that package supplies no exporter,
the command fails instead of exposing the Result repository's private representation. The destination
must not already exist.

The finished Build result prints the exact `result export --output …` command for retained file Outputs;
there is no need to inspect opaque Record ids just to export `final.video`.

### 6. Reuse in a new Build

Export the accepted Output, declare it in the Author Source and update its consumer as described in
[Reusing produced work](#reusing-produced-work). The ordinary production command then uses that
project material:

```bash
hypit build main.svml --target final.video --follow
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
