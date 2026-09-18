# `@hypit/pixverse`

Exact author/compute contracts and a package-owned author Surface for PixVerse V6.

The Surface projects the primary result to an ordinary video Artifact. The package contains no
Provider selection, API key or network execution. The selected Provider implements its exact
capability.

Connect prompt and frames as ordinary graph edges:

```xml
<pix:Video
  id="opening"
  prompt={line}
  duration="5"
  quality="720p"
  aspect-ratio="9:16"
  generate-audio="true"
/>

<pix:Video id="bridge" prompt={motion} duration="5" quality="720p"
  first-frame={hero.image} last-frame={product.image}/>
```

The Surface only lowers this syntax into the package's exact model request. It does not select a
Provider.

The model renders 1 to 15 seconds at `360p`, `540p`, `720p` or `1080p`. A prompt-only run states its
`aspect-ratio`; a run that starts from a `first-frame` takes that frame's shape instead. A
`last-frame` bridges from the first frame into one continuous shot, so it is not combined with
`multi-clip`, which renders the prompt as several cuts.

`generate-audio` renders an audio track alongside the picture, including speech the prompt asks a
character to say. The model exposes no separate voice, language or dialogue field, so a spoken line
belongs in the prompt itself.
