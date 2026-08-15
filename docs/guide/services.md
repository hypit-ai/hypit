---
title: Runtime & External Services
description: Managing the durable Worker and local programs selected by a Runtime Profile.
---

# Runtime & External Services

Two lifecycle scopes are deliberately separate.

## Runtime execution domain

```bash
node --run narratage -- runtime use svml.runtime.json
node --run narratage -- runtime up
node --run narratage -- runtime status
node --run narratage -- runtime logs
node --run narratage -- runtime down
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

A stopped idle Runtime is a valid observation, not a failed command. `runtime status` exits
successfully after a successful query and reports `ready: false`; it becomes an attention warning
when unfinished dispatch exists but the Worker or a required declared program is unavailable.

The Worker record binds an opaque Profile revision supplied by the selected Distribution. The
official JSON Profile implementation covers the Profile bytes plus both package locks it names;
the generic CLI neither parses that document nor assumes what belongs to a revision. Editing the
same Profile path or regenerating either lock therefore makes the official Worker process
`stale`. The next `runtime up` or `build` first checks the DispatchStore: unfinished work from the
old revision rejects the new revision without stopping the old Worker or starting external
programs. Once old work is terminal, replacement is allowed.

`runtime down` stops only the Worker. It deliberately leaves external programs alone because another
Runtime Profile may share them. Use `services down` when the programs themselves should stop.
Neither command cancels Builds or remote Provider jobs; queued Builds remain durable.

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

`services status` names every unavailable declared program and also treats a successful query as a
successful command. Readiness remains explicit in its structured `ready` field. `services up` and
`services down` are lifecycle requests and still fail when the requested state is not reached.

## Build relationship

```bash
node --run narratage -- build build.svrun
node --run narratage -- build build.svrun --follow
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
node --run narratage -- queue
node --run narratage -- queue --watch
node --run narratage -- status <build-id>
node --run narratage -- inspect <build-id>
node --run narratage -- cancel <build-id>
```

These views expose the active durable dispatch set, Worker state, lease/capacity facts, Operation
attempts, generic Endpoint progress, checkpoints and cancellation state. They do not reconstruct a
secret second graph or ask a Provider for creative
routing.

The public control unit is the Build. `cancel` atomically withdraws a queued Build that no Worker
has claimed, or closes admission and reconciles already-submitted Provider work for a running
Build. Individual Operations remain visible inside Build status but are not independently
controlled by the CLI. A terminal Build is never reopened; running the same `.svrun` submits a new
Build. Endpoint checkpoint recovery only continues the same already-paid external task after a
Worker restart.

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
