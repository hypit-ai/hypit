# `@hypit/provider-xiaomi-mimo`

Immediate Runtime Endpoint for Xiaomi's official MiMo V2.5 Voice Design and Voice Clone APIs.

This package owns the `chat/completions` wire shape, `api-key` credential, timeout, response bounds,
voice-reference encoding and ResourceStore ingestion. It names `@hypit/tts@1` capabilities
as versioned data and does not import the model package at runtime.

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

Voice Design sends the authored voice description. Voice Clone reads the selected audio Resource,
checks Xiaomi's accepted MP3/WAV formats and sends it as the vendor's data-URL voice reference.
The Provider always requests final WAV bytes.

Selecting this Provider in the Runtime Profile is independent from author syntax. Its pool and
capability claims participate in the shared Runtime capacity model; the package has no private
scheduler.
