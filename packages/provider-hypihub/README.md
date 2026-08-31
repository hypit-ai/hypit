# `@hypit/provider-hypihub`

Thin Hypit Runtime Provider for a HypiHub `/v1` deployment. It is an optional default gateway for
paid generation and Gemini VLM requests; callers may keep their own Provider and select HypiHub only
when its key is configured.

It maps the currently shipped image/video model capabilities to HypiHub, submits jobs, polls them,
downloads the first-class assets and persists them in Hypit's configured ArtifactStore. It also
exports a small Gemini-native VLM generator for callers that previously used Vertex. The generation
adapter intentionally supports prompt-only requests; reference-media inputs are rejected until a
shared Artifact URL bridge is needed.

Runtime Profile example:

```json
{
  "endpoints": {
    "hypihub.default": {
      "use": "@hypit/provider-hypihub",
      "pool": "hypihub.default",
      "config": {
        "baseUrl": "https://hypit.ai/v1",
        "apiKey": { "store": "env", "key": "HYPIHUB_API_KEY" },
        "defaultConcurrency": 4
      }
    }
  }
}
```

Gemini VLM callers can use the exported `createHypiHubGeminiGenerator` without changing their
provider-facing code. Set `HYPIHUB_API_KEY` (and optionally `HYPIHUB_BASE_URL`) only when choosing
HypiHub; missing or insufficient user credentials should be resolved at [hypit.ai](https://hypit.ai).
