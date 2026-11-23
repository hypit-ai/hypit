# Choose and Connect Model Services

Read this when checking account readiness, connecting HypiHub, inspecting available model
capabilities, or adding a custom project Model/Provider.

## Responsibilities

| Part | What it owns |
| --- | --- |
| **ExecutionHost** | Runs selected Execution Environments and persists recoverable Invocations and Publications |
| **Execution Environment** | Owns Provider/model capacity, account auth (`hypit auth`), quoting, and job execution |
| **Capability / Model** | Typed request schema, inputs, reference roles, and output media types |
| **Canvas** | Holds recipes, input bindings, Invocation attachments, and Publication selections |

## Check readiness and authenticate (HypiHub)

HypiHub is the default integrated hosted Execution Environment, supplying image, video, speech,
transcription, and matting models through one OAuth connection.

```bash
hypit auth status
hypit execution doctor
hypit execution capabilities --json
```

If not signed in, connect with:

```bash
hypit auth login
# Headless / remote terminal:
hypit auth login --manual --no-open
```

To sign out:

```bash
hypit auth logout
```

Pass `--environment <id>` when multiple Execution Environments are configured.
In Hypit Desktop, account login and subscription/credit management are handled in the Desktop
Settings view; use `account_balance` (or `hypit execution doctor`) to verify readiness.

## Bundled model packages

Hypit ships typed Capability packages that contribute `canvas.model` entries and work with HypiHub:

- **Image**: `@hypit/gpt-image`, `@hypit/nano-banana`, `@hypit/seedream`, `@hypit/grok-imagine`
- **Video**: `@hypit/seedance`, `@hypit/pixverse`, `@hypit/bach`, `@hypit/minimax-h3`
- **Speech**: `@hypit/fishaudio-speech`, `@hypit/mimo-speech`
- **Transcription / Matting**: `@hypit/whisperx`, `@hypit/volcengine-matting`

Always run `hypit canvas catalog <file.canvas.json> --json` or `hypit execution capabilities --json`
to inspect the exact live capability IDs, fields, modes, and outputs available in the current
project and Environment rather than guessing model parameters from memory.

## Spending discipline

- Quote before submitting paid Invocations:
  - Canvas: `hypit canvas quote <file.canvas.json> <node> --json`
  - Standalone: `hypit execution quote <capability> --input req.json [--resources res.json] --json`
- Confirm account, scope, and expected credits with the user before starting new paid work beyond
  their settled Brief.
