---
title: Run Source & Builds
description: Declaring build targets, reusing results and configuring the runtime.
---

# Run Source & Builds

The Run Source (`.svrun`) declares **what to build** — which outputs to demand, what fidelity to
accept, and optionally how to reuse results from prior Builds. The Runtime Profile
(`svml.runtime.json`) declares **where to run** — endpoints, credentials, concurrency, and
permissions.

Neither of these changes what the video **is**. That is the Author Source's job.

## Run Source syntax

Every `.svrun` file begins with its processing instruction:

```svml
<?svml using="@narratage/run-markup@1"?>
```

### Minimal Run Source

```svml
<?svml using="@narratage/run-markup@1"?>

<svrun version="1" targets="delivery">
  <author source="./main.svml"/>
  <target-set id="delivery">
    <target output="final.video" accepts="exact"/>
  </target-set>
</svrun>
```

| Element | Description |
|---|---|
| `<svrun>` | Root element. `version="1"`, `targets` names the active target-set |
| `<author>` | Mandatory. `source` points to the `.svml` Author Source |
| `<target-set>` | A named set of demanded outputs |
| `<target>` | One demanded output: `output` names a Logical Output, `accepts` sets fidelity |

### Targets

A **Target** names an output required by the Build and the worst fidelity it accepts:

- `accepts="exact"` — the output must be exactly what the author declared
- `accepts="substitute"` — an acceptable replacement is allowed (e.g. a prior generation)

There is no privileged "final video" root. Any public Logical Output from any component can be a
Target. The compiler only executes Operations needed to satisfy the demanded Targets — everything
else is pruned.

### Multiple targets

You can demand multiple outputs from one Build:

```svml
<target-set id="delivery">
  <target output="final.video" accepts="exact"/>
  <target output="captions.track" accepts="exact"/>
</target-set>
```

Or define multiple target-sets and switch between them:

```svml
<svrun version="1" targets="preview">
  <author source="./main.svml"/>

  <target-set id="preview">
    <target output="captions.track" accepts="substitute"/>
  </target-set>

  <target-set id="delivery">
    <target output="final.video" accepts="exact"/>
  </target-set>
</svrun>
```

The `targets` attribute on `<svrun>` selects which set is active.

## Reusing results

Narratage has no implicit cache. Reusing a result is explicit Run Graph authoring — you declare
historical Records as zero-input Candidates and connect them through Satisfaction edges.

```svml
<?svml using="@narratage/run-markup@1"?>

<svrun version="1" targets="delivery">
  <author source="./main.svml"/>
  <target-set id="delivery">
    <target output="final.video" accepts="substitute"/>
  </target-set>

  <build-record id="hook-video"
    build="my-film-001" output="hook-take.video"/>
  <build-record id="meeting-video"
    build="my-film-001" output="meeting-take.video"/>
  <build-record id="evidence-video"
    build="my-film-001" output="evidence-take.video"/>
  <build-record id="payoff-video"
    build="my-film-001" output="payoff-take.video"/>

  <satisfy output="hook-take.video"
    candidate="hook-video" fidelity="substitute"/>
  <satisfy output="meeting-take.video"
    candidate="meeting-video" fidelity="substitute"/>
  <satisfy output="evidence-take.video"
    candidate="evidence-video" fidelity="substitute"/>
  <satisfy output="payoff-take.video"
    candidate="payoff-video" fidelity="substitute"/>
</svrun>
```

### Finding reusable output

Query an output name as it appeared in each historical Build's frozen Host Catalog:

```bash
node --run narratage -- history hook-take.video \
  --runtime ./svml.runtime.json
```

`history` reports only public Logical Outputs that the Build actually selected and accepted. It
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
<satisfy output="opening-shot.video"
  candidate="approved-opening" fidelity="substitute"/>
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
| `fidelity` | `exact` or `substitute` |

The compiled plan prunes all upstream Operations that the substitute Candidates replace. This is a
new Build, not a continuation of the old one. Downstream processing (normalization, WhisperX,
captioning, rendering) still runs against the reused media.

### Fidelity model

- **`exact`** — the Candidate precisely matches what the author declared
- **`substitute`** — the Candidate is an acceptable replacement

Substitute fidelity is **monotonic**: once a substitute enters the graph, it propagates downstream.
You cannot wash it back to exact. If the final target accepts `substitute`, downstream Operations
that consume substitute inputs produce substitute results.

## Runtime Profile

The Runtime Profile (`svml.runtime.json`) tells the system **where** to run each type of work:

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
      "lane": "generation",
      "config": {
        "apiKey": { "store": "env", "key": "KIE_API_KEY" },
        "defaultConcurrency": 2
      }
    },
    {
      "use": "@narratage/provider-media-local",
      "instance": "media.main",
      "lane": "media",
      "config": { "defaultConcurrency": 2 }
    },
    {
      "use": "@narratage/provider-whisperx-local",
      "instance": "whisperx.main",
      "lane": "alignment",
      "config": { "defaultConcurrency": 1 }
    },
    {
      "use": "@narratage/provider-google-vertex",
      "instance": "vertex.main",
      "lane": "planning",
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
      "lane": "render",
      "config": {
        "workers": 2,
        "quality": "standard",
        "defaultConcurrency": 1
      }
    }
  ],
  "permissions": [
    "environment:credentials",
    "filesystem:artifacts",
    "filesystem:state",
    "filesystem:whisperx-staging",
    "network:aiplatform.googleapis.com",
    "network:api.kie.ai",
    "network:kieai.redpandaai.co",
    "network:whisperx-loopback",
    "process:hyperframes",
    "process:media"
  ],
  "scheduling": {
    "maxConcurrency": 4,
    "lanes": {
      "generation": 2,
      "media": 2,
      "alignment": 1,
      "planning": 1,
      "render": 1
    }
  }
}
```

### Endpoints

Each endpoint binds a Provider package to a named instance with a concurrency lane:

| Field | Description |
|---|---|
| `use` | Provider package name (e.g. `@narratage/provider-kie`) |
| `instance` | Unique instance identifier |
| `lane` | Scheduling lane for concurrency control |
| `config` | Provider-specific non-secret configuration and ordinary CredentialRefs |

### Permissions

Explicit grants for filesystem, network, and process access. The scheduler refuses Operations that
require permissions not listed here.

### Scheduling

`maxConcurrency` limits total parallel Operations. `lanes` sets per-lane concurrency limits to
prevent one type of work from starving others.

## Build workflow

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

node --run narratage -- lock-packages /work/my-film/svml.packages.lock \
  --package @narratage/script \
  --package @narratage/estimate

node --run narratage -- plan /work/my-film/build.svrun \
  --runtime /work/my-film/svml.runtime.json
```

The Source Workspace defaults to the directory containing `build.svrun`; its relative Author
Sources and assets stay inside that boundary. `--package-root` has one unrelated Host purpose: it
overrides where the CLI locates the installed `node_modules` whose bytes are verified against the
lock. The official CLI normally supplies its own installation location, so no package path is
needed above. Use `--root` only when deliberately widening the Source Workspace above the Run
Source directory. Do not symlink a project into this repository: canonical-path containment
intentionally rejects that escape.

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
  "permissions": ["environment:credentials", "filesystem:artifacts", "filesystem:state"],
  "scheduling": { "maxConcurrency": 4 }
}
```

Runtime state, archived Artifacts and the lock files remain under `/work/my-film`. Set
`--package-root` or the Profile's `packageRoot` only when the packages intentionally live somewhere
other than the CLI installation.

### 1. Diagnose the environment

```bash
node --run narratage -- doctor examples/talking-head-aroll/svml.runtime.json
```

Doctor validates both locks, every selected Runtime role, Endpoint configuration, credential
presence and bounded environment probes. It never starts the Worker or performs a paid request.

### 2. Inspect the plan

```bash
node --run narratage -- plan examples/talking-head-aroll/build.svrun \
  --runtime examples/talking-head-aroll/svml.runtime.json --root .
```

Review the frozen BuildPlan before spending money. The plan shows every Operation and Needs the
Scheduler would issue.

### 3. Submit the Build

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
| `--root` | Optional Source Workspace boundary; defaults to the entry Source directory |
| `--build-id` | User-chosen identifier for this Build (used for retrieval and reuse) |
| `--follow` | Wait for terminal state as an observer; durable execution remains with the Worker |

Without `--build-id`, identity is derived from the compiled Author and Run intent: repeating the
same command addresses the same durable Build and does not silently buy another generation. An
unfinished Build continues from accepted Records and recoverable Endpoint checkpoints; a completed,
failed or cancelled Build remains terminal and is only reported. Use a new explicit id when the same
unchanged prompt intentionally needs another stochastic take. Reusing an explicit id for different
compiled intent is rejected with both repair choices.

### 4. Retrieve results

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

### 5. Reuse in a new Build

Create a new `.svrun` file that references the completed Build's Records (see [Reusing results](#reusing-results)
above), then submit it:

```bash
node --run narratage -- build examples/talking-head-aroll/reuse-generated.svrun \
  --runtime examples/talking-head-aroll/svml.runtime.json \
  --root . --build-id my-film-reuse-001 --follow
```
