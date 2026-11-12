# Meta Model API Providers

Two project Providers for [Meta Model API](https://dev.meta.ai), written against the public Hypit
endpoint SDK. They are a real-service counterpart to
[`examples/provider-package`](../../../examples/provider-package): same boundary, same install shape,
a live vendor protocol instead of an illustrative one.

| Package | Capability | Service | Lifecycle |
|---|---|---|---|
| `packages/provider-images` | `@hypit/gpt-image@1#gpt-image-2` | `muse-image-1.0` via `POST /v1/images/generations` and `POST /v1/images/edits` | immediate |
| `packages/provider-voice` | `@hypit/whisperx@1#whisperx-alignment` | `muse-voice-transcribe-1.0` via `POST /v1/asr/transcribe` | immediate |

Both packages are plain ESM with no build step and no bundled credentials. They import the runtime
kits (`@hypit/hypit/endpoint`, `@hypit/hypit/runtime-kit`, `@hypit/runtime-local/extension`,
`@hypit/speech-evidence`, `@hypit/whisperx`) and are installed into a video project with its package
manager.

## Install

```bash
# inside the video project
npm install /path/to/provider-images /path/to/provider-voice
```

Then select them in the project's `hypit.runtime.json`:

```json
{
  "format": "hypit.runtime-local@1",
  "dataRoot": ".hypit/runtimes/local",
  "credentials": { "local": { "use": "@hypit/credential-store-local" } },
  "endpoints": {
    "meta.image": {
      "use": "@example/provider-meta-images",
      "config": {
        "baseUrl": "https://api.meta.ai/v1",
        "model": "muse-image-1.0",
        "apiKey": { "store": "local", "key": "meta.image" }
      }
    },
    "meta.voice": {
      "use": "@example/provider-meta-voice",
      "config": {
        "baseUrl": "https://api.meta.ai/v1",
        "model": "muse-voice-transcribe-1.0",
        "mode": "ENDPOINTING",
        "apiKey": { "store": "local", "key": "meta.voice" }
      }
    }
  },
  "bindings": {
    "@hypit/gpt-image@1#gpt-image-2": "meta.image",
    "@hypit/whisperx@1#whisperx-alignment": "meta.voice"
  }
}
```

Store the key without putting it in the profile or the Source:

```bash
hypit auth login meta.image --from /path/to/meta-key.txt
hypit auth login meta.voice --from /path/to/meta-key.txt
```

`hypit doctor` then reports the endpoints and their credential slots.

## Provider support ranges

Both Providers narrow the Model's vocabulary to what the live service actually does, and say so from
`supports` rather than silently editing the request:

- **Images**: aspect ratios 1:1, 4:3, 3:4, 16:9, 9:16. Up to four reference images, which route to
  `/images/edits` as multipart; no references route to `/images/generations` as JSON. Muse sets the
  output pixel size itself, so a Source declares the ratio (via `space:Extent`) and not an exact
  resolution; the Model's `resolution` port is accepted and not forwarded.
- **Voice**: mono 16-bit PCM WAV at 16 kHz or 24 kHz, at most 10 minutes and 32 MB, which is the
  service's own cap. Anything else is refused before a request is charged.

## Muse Voice timing — read this before trusting caption sync

`muse-voice-transcribe-1.0` returns **turn-level timings only**. Meta's documentation says word-level
timestamps, confidence scores and sound-event detection are unavailable, and a live call confirms it:
the response carries `turns[]` with `startMs`/`endMs` and no word times.

Hypit's alignment contract needs a time for every authored Token, so `provider-voice` derives word
times by splitting each measured turn across its words in proportion to word length. The transcript
text, turn boundaries and segment span are measured; the per-word split is estimated, bounded by the
turn it belongs to. The Provider emits a diagnostic on every call saying exactly that.

Consequences:

- suitable for readable captions and phrase-level emphasis;
- not suitable for karaoke-grade word sync, lip sync, or any claim where a word's onset is evidence;
- if word accuracy matters, bind the same capability to the local WhisperX Provider or to HypiHub —
  the Source and Run are unchanged.

## Verification performed

- Image transport: 1024×1024 and 16:9 generations, and a reference edit through `/images/edits`
  (multipart `image` field — Meta rejects `image[]`).
- Voice transport: 7.52 s mono 16 kHz WAV, three detected turns, transcript returned.
- Hypit integration: `hypit transcribe` wrote a `hypit.transcript@1` document (23 words, 2 passages);
  a Build of `<whisperx:Alignment>` completed through `meta.voice`; a caption Build rendered
  240 frames at 2560×1440 with the derived timing driving the karaoke highlight.

## Costs

Muse Image is billed per generated image; Muse Voice Transcribe is billed per hour of audio. See the
service's pricing page. Neither package adds a charge of its own; `pricing` points at the vendor page
and rates and credentials do not grant spending permission.
