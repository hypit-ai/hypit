---
title: Run Source & Builds
description: Declaring build targets, reusing results and configuring the runtime.
---

# Run Source & Builds

The Author Source defines the video. A Run Source chooses which of its public outputs to produce and
which explicit Candidates, if any, should satisfy them. The Runtime Profile chooses the machine,
stores and Provider endpoints that execute the resulting plan.

Package trust is synchronized once after package selections change:

```bash
narratage packages sync build.svrun --runtime svml.runtime.json
```

Ordinary work then follows the short path:

```bash
narratage plan build.svrun --runtime svml.runtime.json
narratage build build.svrun --runtime svml.runtime.json --build-id my-video-001 --follow
narratage get my-video-001 --runtime svml.runtime.json --name final.video --to output/final.mp4
```

The checked-in source launcher is `/path/to/narratage/narratage`; commands written as `narratage`
on this page mean that launcher or the future installed CLI.

Only `build` submits work. `plan` is the normal preview. `check` is an editing aid; `doctor` is a
deployment diagnostic. They are safe to run, but not mandatory ceremony before every Build.

```text
main.svml          author meaning
build.svrun        this Run's Targets and Candidate choices
svml.runtime.json  execution environment
```

Run Source and Runtime Profile do not silently rewrite the video. Creative model choices remain in
the Author Source or in packages that it explicitly imports.

## Run Source syntax

Every `.svrun` file begins with its processing instruction:

```svml
<?svml using="@narratage/run-markup@1"?>
```

### Minimal Run Source

```svml
<?svml using="@narratage/run-markup@1"?>

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

A Target is simply an output you want from this Build. It may be a generated image, a video take, a
timing map, a Track or the final render. The compiler only executes Operations needed for the chosen
Targets; unrelated branches are left alone.

### Multiple targets

You can demand multiple outputs from one Build:

```svml
<target output="final.video"/>
<target output="captions.track"/>
```

Different build intentions should be separate `.svrun` files. They can point to the same Author
Source without duplicating it. For example, `images.svrun` may target image outputs while
`film.svrun` targets the final video.

## Reusing results

Narratage has no implicit cache. Reusing a result is explicit Run Graph authoring — you declare
historical Records as zero-input Candidates and connect them through Satisfaction edges.

As soon as a generated image or take is accepted, reuse it explicitly in the next `.svrun` with
`build-record` and `satisfy`, then inspect the frozen plan before starting paid downstream work.
Core has no Pin state or fidelity label.

```svml
<?svml using="@narratage/run-markup@1"?>

<svrun version="1">
  <author source="./main.svml"/>
  <target output="final.video"/>

  <build-record id="hook-video"
    build="my-film-001" output="hook-take.video"/>
  <build-record id="meeting-video"
    build="my-film-001" output="meeting-take.video"/>
  <build-record id="evidence-video"
    build="my-film-001" output="evidence-take.video"/>
  <build-record id="payoff-video"
    build="my-film-001" output="payoff-take.video"/>

  <satisfy output="hook-take.video" candidate="hook-video"/>
  <satisfy output="meeting-take.video" candidate="meeting-video"/>
  <satisfy output="evidence-take.video" candidate="evidence-video"/>
  <satisfy output="payoff-take.video" candidate="payoff-video"/>
</svrun>
```

### Finding reusable output

Query an output name as it appeared in each historical Build's frozen Host Catalog:

```bash
node --run narratage -- history hook-take.video \
  --runtime ./svml.runtime.json
```

`history` reports only public Logical Outputs that the Build actually produced. It
does not list merely declared-but-unbuilt aliases or authored Record aliases that cannot back a
`build-record` Candidate. If the old name is unknown, list accepted output names from Builds whose
Catalog recorded an exact source path:

```bash
node --run narratage -- history --source ./main.svml \
  --runtime ./svml.runtime.json
```

An output name is a human locator inside one immutable historical Catalog, not its identity. The
historical Core Build, Logical Output and Record digests carry identity. If the current source
renames `hook-take.video` to `opening-shot.video`, keep the old name on `<build-record>` and use the
current name on `<satisfy>`:

```svml
<build-record id="approved-opening"
  build="my-film-001" output="hook-take.video"/>
<satisfy output="opening-shot.video" candidate="approved-opening"/>
```

Narratage never infers that two names mean the same author intent. A human-readable build-id such
as `my-film-001` is supplied with `build --build-id`; omitting it uses the immutable compiled Core
Build digest. Reusing one explicit build-id for different compiled Author or Run intent is rejected.

### build-record

Declares a zero-input Candidate backed by a historical Record from a previous Build:

| Attribute | Description |
|---|---|
| `id` | Local Candidate id within this Run Source |
| `build` | The build-id of the previous Build |
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
<file id="approved-opening" from="./approved-opening.mp4" media-type="video/mp4"/>
<satisfy output="opening-shot.video" candidate="approved-opening"/>
```

The file is read relative to the `.svrun`, content-addressed and archived with the Build. There is
no special Pin state, filename cache or hidden history lookup. A black video, preview image or
human-supplied result uses the same mechanism.

## Runtime Profile

The declarative Runtime Profile (`svml.runtime.json`) tells the CLI **where** to run each type of
work. Applications embedding Narratage may assemble the same Runtime roles through
`@narratage/local`, but executable modules are not CLI Profiles. See the complete
[Runtime Profile guide](../guide/runtime-profile.md).

```json
{
  "format": "svml.runtime-config@1",
  "packageLock": "./svml.packages.lock",
  "runtimePackageLock": "./svml.runtime-packages.lock",
  "runtimeServices": [
    { "use": "@narratage/local", "instance": "execution" },
    { "use": "@narratage/store-sqlite", "instance": "state", "config": { "path": ".svml/runtime.sqlite" } },
    { "use": "@narratage/artifact-store-fs", "instance": "artifacts", "config": { "path": ".svml/artifacts" } },
    { "use": "@narratage/credential-store-env", "instance": "credentials.env", "config": {} }
  ],
  "services": {
    "scheduler": "execution.scheduler",
    "worker": "execution.worker",
    "stores": {
      "build": "state.builds",
      "operations": "state.operations",
      "dispatch": "state.dispatch",
      "journal": "state.journal",
      "artifacts": "artifacts",
      "credentials": ["credentials.env"]
    }
  },
  "endpoints": [
    {
      "use": "@narratage/provider-kie",
      "instance": "kie.main",
      "config": {
        "apiKey": { "store": "env", "key": "KIE_API_KEY" },
        "defaultConcurrency": 2
      }
    },
    {
      "use": "@narratage/provider-media-local",
      "instance": "media.main",
      "config": { "defaultConcurrency": 2 }
    },
    {
      "use": "@narratage/provider-whisperx-local",
      "instance": "whisperx.main",
      "config": { "defaultConcurrency": 1 }
    },
    {
      "use": "@narratage/provider-google-vertex",
      "instance": "vertex.main",
      "config": {
        "projectEnv": "GOOGLE_CLOUD_PROJECT",
        "credentials": { "store": "env", "key": "GOOGLE_APPLICATION_CREDENTIALS_JSON" },
        "location": "global",
        "defaultConcurrency": 1
      }
    },
    {
      "use": "@narratage/provider-hyperframes-local",
      "instance": "hyperframes.main",
      "config": {
        "workers": 2,
        "quality": "standard",
        "defaultConcurrency": 1
      }
    }
  ],
  "scheduling": { "maxConcurrency": 4 }
}
```

### Endpoints

Each endpoint binds a Provider package to a named instance and an explicit Provider Authority:

| Field | Description |
|---|---|
| `use` | Provider package name (e.g. `@narratage/provider-kie`) |
| `instance` | Unique instance identifier |
| `authority` | Optional shared account/compute-pool identity; omit it when this instance owns its own limits |
| `config` | Provider-specific non-secret configuration and ordinary CredentialRefs |

### Trust

Runtime packages currently execute as trusted local code. A real process/Wasm sandbox is required
before arbitrary third-party runtime packages can be treated as untrusted.

### Scheduling

`maxConcurrency` limits total parallel Operations. Every Provider contributes an Authority resource
and one exact capability Route resource. Optional `resources` overrides use those opaque resource
ids; they never select a model or Provider.

## Configure selected credentials

`check` and `plan` do not make live Provider requests and do not need API keys. Before `doctor` or a
paid/external `build`, configure only the environment variables referenced by the selected Runtime
Profile:

| Variable | Provider/use |
|---|---|
| `KIE_API_KEY` | KIE models, including Seedance and GPT Image |
| `GOOGLE_CLOUD_PROJECT` | Google Cloud project with Vertex AI enabled |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Complete Vertex credential JSON contents, not a file path |
| `MIMO_API_KEY` | Xiaomi MiMo TTS, only when that Endpoint is selected |

Run only the lines for the Endpoints in your Profile. In macOS/Linux shells:

```bash
read -r -s KIE_API_KEY
export KIE_API_KEY
read -r -s MIMO_API_KEY
export MIMO_API_KEY
export GOOGLE_CLOUD_PROJECT="your-project-id"
export GOOGLE_APPLICATION_CREDENTIALS_JSON="$(<"$HOME/.config/narratage/google-service-account.json")"
```

In Windows PowerShell:

```powershell
$env:KIE_API_KEY = "your-key"
$env:MIMO_API_KEY = "your-key"
$env:GOOGLE_CLOUD_PROJECT = "your-project-id"
$env:GOOGLE_APPLICATION_CREDENTIALS_JSON = Get-Content -Raw "$HOME\.config\narratage\google-service-account.json"
```

Keep credentials out of Author Source, Run Source, Runtime Profile source, and committed files.
`doctor` validates required credential presence without printing secret values.

## Build workflow

Keep credentials, generated media, Runtime state/databases, and logs out of commits.

### 0. Install

```bash
pnpm install
```

This installs only the JavaScript workspace. It does not download Python models or prepare every
Provider found in the repository. `runtime up` / `services up` reads the selected Runtime Profile
and prepares only the external programs its chosen Endpoints declare. Install
[uv](https://docs.astral.sh/uv/) first only when that Profile selects a local Python service such as
WhisperX or OpenCV.

`narratage runtime up` starts the durable Worker and the external programs declared by the selected
adapters. `build` also ensures that execution domain is running before it submits, but never owns
the Worker.

#### Keep production projects outside the Narratage checkout

Author files do not have to live under this repository. For example, keep a project at
`/work/my-film` while using packages installed in `/opt/narratage`:

```bash
cd /opt/narratage

node --run narratage -- packages sync /work/my-film/build.svrun \
  --runtime /work/my-film/svml.runtime.json

node --run narratage -- plan /work/my-film/build.svrun \
  --runtime /work/my-film/svml.runtime.json
```

When a Runtime Profile is selected, its `root` (or its own directory when `root` is omitted) is the
stable Source Workspace for every `.svml`, `.svs`, and `.svrun` in that project. Without a Profile,
the package-lock directory is the boundary when a lock is selected; otherwise the entry Source
directory is used. `--package-root` has one unrelated Host purpose: it
overrides where the CLI locates the installed `node_modules` whose bytes are verified against the
lock. The official CLI normally supplies its own installation location, so no package path is
needed above. Use `--root` only when deliberately widening the Source Workspace above the Run
Source directory. Do not symlink a project into this repository: canonical-path containment
intentionally rejects that escape.

Keep deployment state out of source control. A normal external project should include:

```gitignore
.svml/
output/
```

Package locks are project source and should remain committed. Read-only archive commands such as
`status` and `builds` do not initialize an absent Runtime database.

For a shared read-only media library, keep Source imports inside the project and authorize only its
asset bytes explicitly:

```bash
node --run narratage -- plan /work/my-film/build.svrun \
  --runtime /work/my-film/svml.runtime.json \
  --asset-root /work/shared-media
```

`--asset-root` is repeatable. It never permits `.svml`/`.svs` source imports outside `--root`, and
it does not enter Author or Build identity; the exact bytes still enter as content-addressed assets.

The official CLI supplies the same installation location while reading the external project's
Runtime Profile, so the Profile remains portable:

```json
{
  "format": "svml.runtime-config@1",
  "packageLock": "./svml.packages.lock",
  "runtimePackageLock": "./svml.runtime-packages.lock",
  "runtimeServices": [
    { "use": "@narratage/local", "instance": "execution" },
    { "use": "@narratage/store-sqlite", "instance": "state", "config": { "path": ".svml/runtime.sqlite" } },
    { "use": "@narratage/artifact-store-fs", "instance": "artifacts", "config": { "path": ".svml/artifacts" } },
    { "use": "@narratage/credential-store-env", "instance": "credentials.env", "config": {} }
  ],
  "services": {
    "scheduler": "execution.scheduler",
    "worker": "execution.worker",
    "stores": {
      "build": "state.builds",
      "operations": "state.operations",
      "dispatch": "state.dispatch",
      "journal": "state.journal",
      "artifacts": "artifacts",
      "credentials": ["credentials.env"]
    }
  },
  "endpoints": [],
  "scheduling": { "maxConcurrency": 4 }
}
```

Runtime state, archived Artifacts and the lock files remain under `/work/my-film`. Set
`--package-root` or the Profile's `packageRoot` only when the packages intentionally live somewhere
other than the CLI installation.

### 1. Synchronize installed packages

After installing or updating packages, synchronize the project inventories:

```bash
node --run narratage -- packages sync examples/talking-head-aroll/build.svrun \
  --runtime examples/talking-head-aroll/svml.runtime.json \
  --root .
```

The current Author and Run sources choose author packages. The Runtime Profile chooses environment
packages. `packages sync` adds or refreshes those requirements in the two inventories; it never
removes packages required by another Run. Use `lock-packages --remove` for an intentional removal.
Compilation activates only the exact subset demanded by the current Source. The command never
scans the project, starts a Provider or generates media.

### 2. Diagnose the environment

```bash
node --run narratage -- doctor examples/talking-head-aroll/svml.runtime.json
```

Doctor validates both locks, every selected Runtime role, Endpoint configuration, credential
presence and bounded environment probes. It never starts the Worker or performs a paid request.

Doctor is intentionally a **full profile audit**. For the environment required by one Run, use
`plan --runtime`: it checks only capabilities demanded by that finite plan. A valid plan remains a
successful command even when `preflight.ok` is false; `doctor` or `build` enforces deployment
readiness.

### 3. Check source and inspect the plan

```bash
node --run narratage -- check examples/talking-head-aroll/main.svml \
  --runtime examples/talking-head-aroll/svml.runtime.json \
  --root .
```

```bash
node --run narratage -- plan examples/talking-head-aroll/build.svrun \
  --runtime examples/talking-head-aroll/svml.runtime.json \
  --root .
```

Review the frozen BuildPlan before spending money. The plan shows every Operation and Needs the
Scheduler would issue. With `--runtime`, it also reports only the relevant Endpoint, credential and
external-program diagnostics. It never starts external work.

`build` starts or reuses the detached Runtime automatically. Use `runtime up` only when you want to
prepare it before submission; `runtime status` observes it. The narrower `services up|status|down`
commands manage external programs only and do not own the Worker lifecycle.

### 4. Submit the Build

```bash
node --run narratage -- build examples/talking-head-aroll/build.svrun \
  --runtime examples/talking-head-aroll/svml.runtime.json \
  --root . \
  --build-id my-film-001 \
  --follow
```

Without `--follow`, `build` returns after durable submission. The detached Worker continues. With
`--follow`, the terminal is only an observer; it reports durable phase/Operation-count changes and
interrupting it leaves the Build running.

| Flag | Description |
|---|---|
| `--runtime` | Path to the Runtime Profile |
| `--package-lock` | Standalone compilation lock when no Runtime Profile is supplied; a JSON Profile single-sources it for `check`, `plan` and `build` |
| `--package-root` | Host directory containing the installed packages named by the lock |
| `--root` | Optional Source Workspace override; otherwise the Runtime Profile root, package-lock directory, or entry Source directory is used in that order |
| `--build-id` | User-chosen identifier for this Build (used for retrieval and reuse) |
| `--follow` | Wait for terminal state as an observer; durable execution remains with the Worker |

Without `--build-id`, identity is derived from the compiled Author and Run intent: repeating the
same command addresses the same durable Build and does not silently buy another generation. An
unfinished Build continues from accepted Records and recoverable Endpoint checkpoints; a completed,
failed or cancelled Build remains terminal and is only reported. Use a new explicit id when the same
unchanged prompt intentionally needs another stochastic take. Reusing an explicit id for different
compiled intent is rejected with both repair choices.

### 5. Inspect and retrieve results

```bash
node --run narratage -- inspect my-film-001 \
  --runtime examples/talking-head-aroll/svml.runtime.json
```

`inspect` reports durable Build state, demanded outputs, and accepted Records. Retrieve the selected
archived Artifact only after those facts are correct:

```bash
node --run narratage -- get my-film-001 \
  --runtime examples/talking-head-aroll/svml.runtime.json \
  --name final.video \
  --to examples/talking-head-aroll/output/final.mp4
```

Every accepted intermediate Record and Artifact is archived before the Build completes. `get` makes
a copy of an already durable Record. Blob Artifacts are streamed from the selected Store, checked
against their declared size and SHA-256 digest, and only then atomically replace the destination;
exporting a large MP4 does not buffer the complete file in CLI memory.

The terminal Build result prints the exact `get --name …` command for every targeted source alias;
there is no need to inspect opaque Record ids just to export `final.video`.

### 6. Reuse in a new Build

Create a new `.svrun` file that references the completed Build's Records (see [Reusing results](#reusing-results)
above), then submit it:

```bash
node --run narratage -- build examples/talking-head-aroll/reuse-generated.svrun \
  --runtime examples/talking-head-aroll/svml.runtime.json \
  --build-id my-film-reuse-001 --follow
```

### 7. Diagnose or stop the local Runtime

```bash
node --run narratage -- runtime logs examples/talking-head-aroll/svml.runtime.json
node --run narratage -- runtime down examples/talking-head-aroll/svml.runtime.json
```

`runtime down` stops the Worker from claiming more leases and stops Runtime-owned programs. It does
not cancel durable Builds or remote Provider work. Start the same Profile again to resume local
execution.
