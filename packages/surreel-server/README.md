# Surreel production service

This private service connects the Surreel Flutter application to the real `@codegraff/sdk` and Hypit video tooling. A project starts as a saved brief. Starting a run creates an isolated project output directory, streams Codegraff activity into persisted events, and publishes only declared, verified video outputs. The service never substitutes demo content for a failed production run.

## Start

From the repository root, install workspace dependencies with `pnpm install`, then run:

```bash
pnpm --filter @surreel/server dev
```

The default address is `http://127.0.0.1:8787`. Point the Flutter client at this address. For a single-origin web application, build Flutter web and provide its absolute output directory:

```bash
SURREEL_WEB_DIR=/absolute/path/to/flutter/build/web pnpm --filter @surreel/server start
```

The API requires Node 22.15 or newer, matching the repository. Video production also needs the Hypit runtime's rendering prerequisites, including FFmpeg/FFprobe and Chromium. `ffprobe` verifies every published video; a missing executable or invalid video leaves the project failed with an explanation.

## Agent and runtime setup

The pinned SDK is `@codegraff/sdk` **0.4.2**, using its documented `Harness.init`, `session().send({ prompt, signal })`, and `close()` API. It ships an optional platform binary and otherwise uses `graff` on `PATH`. `SURREEL_GRAFF_BINARY` can select an explicit installation. Provider authentication comes from Codegraff's normal environment variables and existing login state; for example, configure a Codex login with `graff login codex` before running the service. Set `SURREEL_AGENT_MODEL` to choose a configured provider/model. No model or provider is hardcoded.

`GET /api/health` reports whether a compatible executable can be located. It does **not** verify provider credentials, quota, video runtime readiness, or the availability of a paid generation service. Those errors are returned through the project's activity and failure state when a run actually uses them.

Provide an existing Hypit runtime profile with `SURREEL_HYPIT_RUNTIME=/absolute/path/hypit.runtime.json` when projects should share an intentional provider configuration. The agent receives that exact profile selection and is told to leave the profile unchanged. Without it, the agent can initialize a starter runtime in the project, using Hypit's normal project-local selection. Installing missing software or connecting a new paid provider is not automatic.

Each run receives the current Hypit production skill from this checkout and a `SURREEL_BRIEF.json` file. The agent authors editable `.svml`/`.svrun` files, validates and builds the composition, exports its video, and declares outputs in the run's `surreel-output.json`:

```json
{
  "artifacts": [
    { "path": "final.mp4", "name": "Finished video" },
    { "path": "poster.png", "name": "Poster" }
  ]
}
```

Paths are relative to that run's output directory. At least one actual video is required. The server checks path containment, rejects symbolic links and unsupported files, verifies video streams with FFprobe, and copies declared files into immutable published exports. A successful agent turn without a valid video remains a failed production.

## Local execution and access

The default binds to loopback, keeps Codegraff's permission checks enabled, and accepts browser requests only from its own origin or the exact configured frontend origins. The development defaults allow `http://localhost:8080`, `http://127.0.0.1:8080`, and the corresponding port 5173 addresses. No wildcard CORS is used.

Set `SURREEL_SESSION_TOKEN` to protect API calls with `Authorization: Bearer <token>`. Tokens must contain at least 24 characters. A non-loopback bind additionally requires an explicit list of allowed origins. Use an HTTPS reverse proxy when accessing the service over a network. The service is a personal, single-user backend; it does not provide user accounts or tenant isolation.

The Flutter client receives artifact-specific signed URLs when a session token is configured. These links permit that artifact's playback/download without custom media headers; they grant no access to project metadata or run actions. Rotating the session token invalidates old media links. The session token is not inherited by the agent process.

`SURREEL_TRUST_LOCAL_AGENT=1` explicitly enables the SDK's `yolo` option for unattended execution on a trusted local machine. It is off by default. The agent's working directory and file-tool scope are its project, but **a working directory is not an operating-system shell sandbox**. Use a dedicated account/container with only the intended files, credentials, and providers available when running untrusted briefs. There is currently no interactive permission/question dialog: if Codegraff emits `ask_user`, the run stops with the question in its error so the brief or configuration can be updated and retried.

## Configuration

| Variable | Default / purpose |
| --- | --- |
| `SURREEL_HOST` | `127.0.0.1` |
| `SURREEL_PORT` | `8787` |
| `SURREEL_ALLOWED_ORIGINS` | Comma-separated complete frontend origins; no paths or wildcards |
| `SURREEL_SESSION_TOKEN` | Optional bearer token; required for non-loopback binds |
| `SURREEL_PROJECTS_DIR` | OS user data directory under `surreel`, outside the tool checkout |
| `SURREEL_WEB_DIR` | Optional absolute Flutter `build/web` directory |
| `SURREEL_HYPIT_DIR` | This Hypit checkout/distribution root |
| `SURREEL_HYPIT_RUNTIME` | Optional absolute runtime profile |
| `SURREEL_GRAFF_BINARY` | SDK platform binary, falling back to `graff` on `PATH` |
| `SURREEL_AGENT_MODEL` | Existing Codegraff model/provider selection |
| `SURREEL_TRUST_LOCAL_AGENT` | `0`; exactly `1` enables unattended trusted execution |
| `SURREEL_MAX_MODEL_CALLS` | `60` across a run |
| `SURREEL_MAX_TOOL_CALLS` | `180` root tool calls per turn |
| `SURREEL_RUN_TIMEOUT_MS` | `1800000` (30 minutes) |
| `SURREEL_MAX_CONCURRENT_RUNS` | `2`, with at most one run per project |

Environment variables are read from the process; `.env` files are not automatically loaded. The backend inherits provider credentials as needed by Codegraff and Hypit, but sends no credentials to Flutter. Anonymous agent telemetry and learning egress are disabled for these runs.

## HTTP contract

All error responses use `{ "error": "message" }`. JSON bodies are limited to 32 KB. Prompts are limited to 12,000 characters; duration is an integer from 5 through 300 seconds.

| Method | Path | Response / behavior |
| --- | --- | --- |
| `GET` | `/api/health` | `{status, agentAvailable, agent, sdkVersion, authentication, trustLocalAgent}` |
| `GET` | `/api/projects` | `{projects: Project[]}`, newest updates first |
| `POST` | `/api/projects` | `{project}` with HTTP 201; accepts `title?`, `prompt`, `aspectRatio`, `duration`, `style`, `referenceUrl?` |
| `GET` | `/api/projects/:id` | `{project}` including current events, artifacts, and errors |
| `POST` | `/api/projects/:id/runs` | `{project}` with HTTP 202; JSON body `{}` or `{prompt}` for a revision |
| `POST` | `/api/projects/:id/cancel` | `{project}`; aborts the active SDK turn |
| `GET`, `HEAD` | `/api/projects/:id/artifacts/:artifactId` | Media with standard single-byte-range support |

The client polls a selected project to receive activity. Event history retains the latest 300 messages. Production status is one of `draft`, `queued`, `running`, `completed`, `failed`, or `cancelled`. Every revision preserves earlier published artifacts and their download URLs while queued, running, failed, or cancelled. A successful revision appends its new immutable outputs after earlier versions, so the newest video appears last and the media library keeps previous renders. Cancellation is persisted immediately; a late runner result cannot change it to completed. The active slot remains reserved while the SDK closes. Provider-side operations already submitted may continue according to that provider's cancellation behavior.

Project metadata lives separately from agent workspaces and is written atomically with private filesystem permissions. On restart, interrupted queued/running projects become failed with an explanatory event rather than pretending to resume a lost agent process. Run history is represented by retained project events; revisions start a fresh SDK conversation against the existing editable project files. Run only one server process per data directory. Multiple users, distributed locks, interactive approvals, and resumable agent conversations are outside this initial service's scope.

## Verification

```bash
pnpm --filter @surreel/server test
pnpm check
```

The tests inject offline runners for API/state/cancellation coverage, exercise the real SDK against a local protocol fixture, and use a tiny genuine video for publication and HTTP range checks. They never invoke a paid model. SDK references: [official SDK source and guide](https://github.com/justrach/codegraff/tree/main/sdk/ts), [published SDK 0.4.2](https://www.npmjs.com/package/@codegraff/sdk/v/0.4.2).
