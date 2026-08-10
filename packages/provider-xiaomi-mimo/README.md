# `@narratage/provider-xiaomi-mimo`

Immediate Runtime Endpoint for Xiaomi's official MiMo V2.5 TTS API.

This package owns the `chat/completions` wire shape, `api-key` credential, timeout, response bounds,
voice-sample data URI conversion and ArtifactStore ingestion. It does not import
`@narratage/mimo-tts`: capabilities and model port names are bound as versioned data, keeping the
three exact model contracts independent from this particular service.

Runtime Profile example:

```json
{
  "use": "@narratage/provider-xiaomi-mimo",
  "instance": "mimo.official",
  "lane": "xiaomi-mimo",
  "config": {
    "apiKeyEnv": "MIMO_API_KEY",
    "defaultConcurrency": 2
  }
}
```

The Provider always requests final WAV bytes. Streaming is a service transport optimization and is
not part of the author model.

Add the Provider independently to the Runtime package lock:

```sh
pnpm narratage lock-packages svml.runtime-packages.lock \
  --package @narratage/provider-xiaomi-mimo \
  --root .
```

The Provider declares a default concurrency limit on its selected Runtime lane. The shared
Scheduler owns queuing across Builds; this package does not create a private queue.
