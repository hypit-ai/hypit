# `@hypit/provider-hypihub`

Thin Hypit Runtime Provider for a HypiHub `/v1` deployment.

It maps the currently shipped image/video model capabilities to HypiHub, submits jobs, polls them,
downloads the first-class assets and persists them in Hypit's configured ArtifactStore. The first
version intentionally supports prompt-only generation plus preset MiMo TTS; reference-media inputs
are rejected until a shared Artifact URL bridge is needed.

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
