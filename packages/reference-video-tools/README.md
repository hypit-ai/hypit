# `@hypit/reference-video-tools`

MCP stdio tools for reconstructing a reference video with Hypit.

The package exposes `prepare_reference`, `observe_reference`, and
`inspect_svml_vocabulary`. The first two send narrow natural-language requests to Gemini with a
fixed temperature of `1.0`; they never receive SVML syntax and never write SVML. The final source
files are authored by the calling agent and checked with the existing `pnpm hypit check` command.

Start the server from the repository or an installed package:

```bash
node --import tsx packages/reference-video-tools/src/server.ts
```

`prepare_reference` requires a local video path and stores derived media under the project's
gitignored `.hypit/reference-video-tools/` directory. Gemini uses the existing Vertex environment
variables `GOOGLE_CLOUD_PROJECT` and `GOOGLE_APPLICATION_CREDENTIALS_JSON`; the location defaults to
`global` and the model defaults to `gemini-3.1-pro-preview`.
