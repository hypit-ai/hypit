# @hypit/sam-cutout

Cut one named concept out of a clip with **SAM 3.1** (Segment Anything Model 3.1 on Meta Model API),
keeping every frame's alpha channel.

```svml
<import as="sam" from="@hypit/sam-cutout@1"/>

<media:Video id="shot" src="package:<project>/assets/shot.mp4"/>
<sam:Cutout id="subject" prompt="person" source={shot} format="WEBM"/>
<sam:Cutout id="product" prompt="red bicycle" source={shot} format="MOV"/>
```

Each element is one request: the prompt is a real port, so two elements in one Source ask for two
different objects. Object identity is tracked across frames by the service, and a frame that arrives
without a fresh mask reuses the previous one.

## Ports

| Port | Direction | Meaning |
|---|---|---|
| `prompt` | in, required | Short noun phrase naming one object. Refused when empty. |
| `source` | in, required | The video Artifact to cut. |
| `format` | in, optional | `WEBM` (default) or `MOV`. |
| `video` | out | The transparent video, primary artifact. |
| `alternate` | out | The compatibility copy the Endpoint encoded alongside it, when `compatibilityCopy` is on. |

## Why `alternate` exists

A WebM carries alpha out of band (`alpha_mode=1`) and only decoders built on libvpx read it; ProRes
4444 MOV carries it in band but is ~176x larger for the same clip (9.35 MB vs 53 KB on a 2 s 640×640
test). Delivering both costs no extra API call, so the provider encodes both and the model exposes
both as Blobs. Hypit materializes only the port a target names, which is why the second artifact
needs its own selector rather than riding along inside the `GeneratedVideoSet`.

This package adds one producer, `select-alternate-video`, that reads `videos[1]` and throws when the
set has only one entry — an `alternate` that silently equalled the primary would misreport the
format.

## Selecting a provider

The model is vendor-neutral about *how* the cutout is produced; the Runtime binds the Need to an
Endpoint. `contrib/providers/meta-model-api/packages/provider-sam-cutout` is the reference Provider:

```json
{
  "endpoints": {
    "sam.matte": {
      "use": "@example/provider-sam-cutout",
      "config": {
        "baseUrl": "https://api.meta.ai/v1",
        "apiKey": { "store": "local", "key": "sam.matte" },
        "model": "sam-3.1",
        "concept": "person",
        "compatibilityCopy": true
      }
    }
  },
  "bindings": { "@hypit/sam-cutout@1#sam-3.1-cutout": "sam.matte" }
}
```

`concept` on the Endpoint is the fallback used by the older
`@hypit/volcengine-matting@1#matte-portrait-video` capability, which has no prompt port; the new
capability always prefers the authored `prompt`.

## Cost

Muse/SAM billing is per frame for video: $0.20 per 1k frames at the time of writing, so a 30 s 30 fps
clip is 900 frames ≈ $0.18 per cutout. Ask for one format unless a consumer needs the other; a
compatibility copy costs local CPU and storage, not API spend.
