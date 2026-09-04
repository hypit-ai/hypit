# `@hypit/provider-xiaomi-mimo`

Immediate Runtime Endpoint for Xiaomi's official MiMo V2.5 VoiceDesign API.

This package owns the `chat/completions` wire shape, `api-key` credential, timeout, response bounds,
and ResourceStore ingestion. It does not import `@hypit/mimo-tts`: the VoiceDesign capability and
port names are bound as versioned data, keeping the exact model contract independent from this service.

Runtime Profile example:

```json
{
  "endpoints": {
    "mimo.official": {
      "use": "@hypit/provider-xiaomi-mimo",
      "pool": "mimo.official",
      "config": {
        "apiKey": { "store": "os", "key": "xiaomi-mimo.api-key" },
        "defaultConcurrency": 2
      }
    }
  }
}
```

The Provider always requests final WAV bytes. Streaming is a service transport optimization and is
not part of the author model.

Selecting the Provider in the Runtime Profile activates it independently from author model syntax.
It declares total and exact-capability concurrency resources. The shared Runtime coordinates those
claims across Builds; this package does not create a private scheduler.
