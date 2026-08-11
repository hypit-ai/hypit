---
title: Runtime & External Services
description: Managing the durable Worker and local programs selected by a Runtime Profile.
---

# Runtime & External Services

Two lifecycle scopes are deliberately separate.

## Runtime execution domain

```bash
node --run narratage -- runtime up svml.runtime.json
node --run narratage -- runtime status svml.runtime.json
node --run narratage -- runtime logs svml.runtime.json
node --run narratage -- runtime down svml.runtime.json
```

`runtime up` starts or reuses the detached fenced Worker and also prepares/starts the external
programs declared by selected adapters. The process identity, profile digest and log path are
project-scoped. Repeating `runtime up` does not create a second Worker for the same domain.
Independent external programs are prepared concurrently. The human CLI prints each bounded phase
(`Checking`, `Preparing`, `Starting`, `Waiting`, `Ready`) so a first WhisperX model preparation or
browser installation is visible instead of looking like a frozen command. JSON output remains one
clean final document.

`runtime status` combines:

- Worker process and profile identity;
- durable queue phase counts and shared capacity reservations;
- declared external-program health.

The Worker record binds an effective Profile revision covering the Profile bytes plus both package
locks it names. Editing the same Profile path or regenerating either lock makes the old process
`stale`; the next `runtime up` or `build` replaces it before admitting work under the new
configuration.

`runtime down` asks the Worker to stop and then stops programs that the Profile owns. It does not
cancel Builds or remote Provider jobs. Queued Builds remain durable and continue after the Runtime
is brought up again.

## External programs only

```bash
node --run narratage -- services up svml.runtime.json
node --run narratage -- services status svml.runtime.json
node --run narratage -- services down svml.runtime.json
```

`services` is an expert/debugging command. It never starts the Worker and never reads or mutates a
Build queue. It operates only on adapter-declared programs such as:

- the warm local WhisperX HTTP service;
- the managed OpenCV Python environment probe;
- HyperFrames browser preparation;
- local media executable compatibility probes.

Remote-only Endpoints such as KIE have no local service.

## Build relationship

```bash
node --run narratage -- build build.svrun --runtime svml.runtime.json
node --run narratage -- build build.svrun --runtime svml.runtime.json --follow
```

Before submission, `build` derives the capabilities declared by the selected Producer steps and
prepares only external programs backing those capabilities. A text-only or Estimate-only Target
therefore does not load WhisperX merely because the Profile also offers it. This selection changes
no graph edge and does not route Providers; it only avoids starting unrelated deployment programs.
Concurrent launches are serialized per Profile, so they share one Worker and one managed instance
of each demanded external service. The Build command
then stores one verified Build plus dispatch ticket. Without `--follow` it exits immediately after
submission. `--follow` observes durable state only and prints a line when the Build phase or
Operation revision/progress changes; if that Worker stops, it fails with a restart command instead
of waiting forever. Ctrl-C detaches the observer and leaves the Worker running.

`--no-services` skips automatic external-program startup for an operator who already owns those
programs, but it does not create implicit Runtime services or move execution back into the CLI.

Explicit `runtime up` and `services up` still operate the complete Profile because their subject is
the deployment, not one Build.

## Visibility

```bash
node --run narratage -- queue --runtime svml.runtime.json
node --run narratage -- queue --runtime svml.runtime.json --watch
node --run narratage -- status <build-id> --runtime svml.runtime.json
node --run narratage -- operations <build-id> --runtime svml.runtime.json
node --run narratage -- operation <operation-id> --runtime svml.runtime.json
```

These views expose the active durable dispatch set, Worker state, lease/capacity facts, Operation
attempts, generic Endpoint progress, checkpoints and cancellation state. They do not reconstruct a
secret second graph or ask a Provider for creative
routing.

Use `--json` for one versioned result and `--jsonl` for a watch stream. `queue --watch` emits the
first snapshot and later changes; it does not print an identical block every second while a remote
job remains in the same state.

## WhisperX

`@narratage/provider-whisperx-local` declares the warm service. Its health probe locks protocol,
package, model, device, compute type and batch size. It accepts only canonical evidence WAVs beneath
the configured input roots. WhisperX remains one-at-a-time internally; the Runtime Route resource prevents
avoidable `BUSY` responses.

For service development it may be run directly:

```bash
uv sync --project services/whisperx --frozen
uv run --project services/whisperx --frozen svml-whisperx-prepare
uv run --project services/whisperx --frozen svml-whisperx-check
uv run --project services/whisperx --frozen svml-whisperx-service
```

## OpenCV and HyperFrames

The OpenCV adapter owns preparation of its frozen Python environment unless an explicit executable
transfers lifecycle ownership to the deployment. HyperFrames owns its profile-scoped browser
preparation. Neither is a central Runtime default; only a selected locked adapter contributes the
corresponding program.

The local media Endpoint accepts an explicitly configured or system `ffmpeg`/`ffprobe` only after
its capability probe succeeds. Runtime lifecycle does not mutate Homebrew, apt or another system
package manager.
