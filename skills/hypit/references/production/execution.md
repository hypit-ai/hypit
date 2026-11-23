# Standalone Execution Host Commands

Use `hypit execution ...` to inspect Environments, check account readiness, quote or submit
standalone Capability requests, wait/cancel Invocations, and download Publication resources.

## Discovery & diagnostics

```bash
# Check ExecutionHost status
hypit execution status

# Run read-only diagnostics (credential state, model catalog reachability, capability check)
hypit execution doctor [capability] --json

# List all enabled capabilities in the selected Environment
hypit execution capabilities --json
```

## Quoting & submitting a Capability

```bash
# Quote cost (use --resources when the request references local media files)
hypit execution quote <capability> --input request.json [--resources resources.json] --json

# Submit a recoverable Invocation (returns durable address)
hypit execution submit <capability> --input request.json [--resources resources.json] [--invocation-id <uuid>] --json
```

`--input` and `--resources` accept a file path or `-` for stdin (at most one may be `-`).
The `--resources` file maps reference names to local files (paths resolve relative to the
resources JSON file):

```json
{
  "audio": {
    "path": "../media/take.wav",
    "mediaType": "audio/wav",
    "durationSeconds": 12.5
  }
}
```

## Observing, cancelling, and exporting Publication resources

```bash
# Non-blocking status check
hypit execution inspect <invocation> --json

# Wait until complete / failed / cancelled (Ctrl+C only detaches, does not cancel)
hypit execution wait <invocation> [--environment <id>]

# Explicitly cancel a running Invocation
hypit execution cancel <invocation> [--environment <id>]

# Read the completed Publication manifest (outputs & resource names)
hypit execution publication <invocation> --json

# Download a named Publication resource to a new local file
hypit execution resource <invocation> --output <output-name> --resource <resource-name> --to <file>
```

When working inside a Hypit project, prefer `hypit canvas ...` so recipes, history, and media
adoption stay attached to the project's Canvas board. Use `hypit execution ...` directly for
diagnostics (`doctor`, `capabilities`), waiting on Canvas invocations (`wait`, `inspect`, `cancel`),
or standalone utility invocations such as transcription (`@hypit/whisperx`) and matting
(`@hypit/volcengine-matting`).
