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
<?svml using="@narratage/run-text@1"?>
```

### Minimal Run Source

```svml
<?svml using="@narratage/run-text@1"?>

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
<?svml using="@narratage/run-text@1"?>

<svrun version="1" targets="delivery">
  <author source="./main.svml"/>
  <target-set id="delivery">
    <target output="final.video" accepts="substitute"/>
  </target-set>

  <build-record id="hook-video"
    build="talking-head-film-001" output="hook-take.video"/>
  <build-record id="meeting-video"
    build="talking-head-film-001" output="meeting-take.video"/>
  <build-record id="evidence-video"
    build="talking-head-film-001" output="evidence-take.video"/>
  <build-record id="payoff-video"
    build="talking-head-film-001" output="payoff-take.video"/>

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
  "endpoints": [
    {
      "use": "@narratage/provider-kie",
      "instance": "kie.main",
      "lane": "generation",
      "config": {
        "apiKeyEnv": "KIE_API_KEY",
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
        "credentialsEnv": "GOOGLE_APPLICATION_CREDENTIALS_JSON",
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
| `config` | Provider-specific configuration (API keys, concurrency, etc.) |

### Permissions

Explicit grants for filesystem, network, and process access. The scheduler refuses Operations that
require permissions not listed here.

### Scheduling

`maxConcurrency` limits total parallel Operations. `lanes` sets per-lane concurrency limits to
prevent one type of work from starving others.

## Build workflow

### 1. Diagnose the environment

```bash
pnpm narratage doctor examples/talking-head-aroll/svml.runtime.json
```

Doctor checks that every endpoint is reachable, credentials are valid, and required executables
(`ffmpeg`, `ffprobe`, Chrome) are available.

### 2. Inspect the plan

```bash
pnpm narratage plan examples/talking-head-aroll/build.svrun \
  --package-lock examples/talking-head-aroll/svml.packages.lock --root .
```

Review the frozen BuildPlan before spending money. The plan shows every Operation and Needs the
Scheduler would issue.

### 3. Submit the Build

```bash
pnpm narratage build examples/talking-head-aroll/build.svrun \
  --runtime examples/talking-head-aroll/svml.runtime.json \
  --package-lock examples/talking-head-aroll/svml.packages.lock \
  --root . \
  --build-id talking-head-film-001 \
  --follow
```

| Flag | Description |
|---|---|
| `--runtime` | Path to the Runtime Profile |
| `--package-lock` | Path to the package lock file |
| `--root` | Workspace root directory |
| `--build-id` | User-chosen identifier for this Build (used for retrieval and reuse) |
| `--follow` | Stream Build progress to the terminal |

### 4. Retrieve results

```bash
pnpm narratage get talking-head-film-001 \
  --runtime examples/talking-head-aroll/svml.runtime.json \
  --name final.video \
  --to examples/talking-head-aroll/output/final.mp4
```

Every accepted intermediate Record and Artifact is archived before the Build completes. `get` makes
a copy of an already durable Record.

### 5. Reuse in a new Build

Create a new `.svrun` file that references the completed Build's Records (see [Reusing results](#reusing-results)
above), then submit it:

```bash
pnpm narratage build examples/talking-head-aroll/reuse-generated.svrun \
  --runtime examples/talking-head-aroll/svml.runtime.json \
  --package-lock examples/talking-head-aroll/svml.packages.lock \
  --root . --build-id talking-head-film-reuse-001 --follow
```
