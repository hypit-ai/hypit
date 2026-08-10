---
title: Runtime & External Services
description: Managing the durable Worker and local programs selected by a Runtime Profile.
---

# Runtime & External Services

Two lifecycle scopes are deliberately separate.

## Runtime execution domain

```bash
pnpm narratage runtime up svml.runtime.json
pnpm narratage runtime status svml.runtime.json
pnpm narratage runtime logs svml.runtime.json
pnpm narratage runtime down svml.runtime.json
```

`runtime up` starts or reuses the detached fenced Worker and also prepares/starts the external
programs declared by selected adapters. The process identity, profile digest and log path are
project-scoped. Repeating `runtime up` does not create a second Worker for the same domain.

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
pnpm narratage services up svml.runtime.json
pnpm narratage services status svml.runtime.json
pnpm narratage services down svml.runtime.json
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
pnpm narratage build build.svrun --runtime svml.runtime.json
pnpm narratage build build.svrun --runtime svml.runtime.json --follow
```

Before submission, `build` validates the profile and ensures its Runtime is up. The Build command
then stores one verified Build plus dispatch ticket. Without `--follow` it exits immediately after
submission. `--follow` observes durable state only; Ctrl-C detaches the observer and leaves the
Worker running.

`--no-services` skips automatic external-program startup for an operator who already owns those
programs, but it does not create implicit Runtime services or move execution back into the CLI.

## Visibility

```bash
pnpm narratage queue --runtime svml.runtime.json
pnpm narratage queue --runtime svml.runtime.json --watch
pnpm narratage status <build-id> --runtime svml.runtime.json
pnpm narratage operations <build-id> --runtime svml.runtime.json
pnpm narratage operation <operation-id> --runtime svml.runtime.json
```

These views expose durable dispatch phase, lease/capacity facts, Operation attempts, checkpoints and
cancellation state. They do not reconstruct a secret second graph or ask a Provider for creative
routing.

Use `--json` for one versioned result and `--jsonl` for a watch stream.

## WhisperX

`@narratage/provider-whisperx-local` declares the warm service. Its health probe locks protocol,
package, model, device, compute type and batch size. It accepts only canonical evidence WAVs beneath
the configured input roots. WhisperX remains one-at-a-time internally; the Runtime lane prevents
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
