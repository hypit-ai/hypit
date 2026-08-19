# `@hypit/reference-video-tools`

CLI tools for reconstructing a reference video with Hypit.

The package exposes three CLI subcommands: `prepare_reference`, `observe_reference`, and
`inspect_svml_vocabulary`. Each command prints one JSON result to stdout. The first two send narrow
natural-language requests to Gemini with a fixed temperature of `1.0`; they never receive SVML
syntax and never write SVML. The final source files are authored by the calling agent and checked
with the existing `pnpm hypit check` command.

Run the CLI from the repository or an installed package:

```bash
pnpm hypit-reference-video-tools prepare_reference --video-path ./reference.mp4
pnpm hypit-reference-video-tools observe_reference --reference-id <reference-id>
pnpm hypit-reference-video-tools inspect_svml_vocabulary --package @hypit/media-track --tag Track
```

For automation, every command also accepts `--input '{"...":"..."}'` with the complete JSON input
object. This is useful when the calling agent already has a structured request.

`prepare_reference` requires a local video path and stores derived media under the project's
gitignored `.hypit/reference-video-tools/` directory. Gemini uses the existing Vertex environment
variables `GOOGLE_CLOUD_PROJECT` and `GOOGLE_APPLICATION_CREDENTIALS_JSON`; the location defaults to
`global` and the model defaults to `gemini-3.1-pro-preview`.
