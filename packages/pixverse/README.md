# `@hypit/pixverse`

Exact author/compute contracts and package-owned author Surfaces for PixVerse. The package carries
two exact models, `pixverse-v6` and `pixverse-c1`, and selects no Provider, API key or network
execution. The selected Provider implements the exact capability.

Both models render 1 to 15 seconds at `360p`, `540p`, `720p` or `1080p` from a prompt of up to
5,000 characters. `<pix:Video>` generates from the prompt, from a first frame, or from a first and
last frame; `<pix:ReferenceVideo>` generates from the image and video subjects its `Reference`
children carry.

```xml
<pix:Video
  id="opening"
  model="v6"
  prompt={line}
  duration="5"
  quality="720p"
  aspect-ratio="9:16"
  generate-audio="true"
/>

<pix:Video id="bridge" model="c1" prompt={motion} duration="5" quality="720p"
  first-frame={hero.image} last-frame={product.image}/>

<pix:ReferenceVideo id="fusion" model="v6" prompt={outfit} duration="5" quality="720p" aspect-ratio="16:9">
  <pix:Reference image={character.image}/>
  <pix:Reference image={clothes.image}/>
</pix:ReferenceVideo>
```

The prompt addresses the references in the order they appear, as `@ref_1`, `@ref_2` and so on. V6
takes up to ten image references and C1 up to seven. V6 also takes up to two video references
totalling 15 seconds; those carry the length of the run, so that element states no `duration`, and
`aspect-ratio="auto"` takes their shape.

A prompt-only run states its `aspect-ratio`; a run that starts from a `first-frame` takes that
frame's shape instead. A `last-frame` bridges from the first frame into one continuous shot, as do
subject references, so neither is combined with V6's `multi-clip`, which renders the prompt as
several cuts. `seed` and `multi-clip` are V6's own switches.

`generate-audio` renders an audio track alongside the picture, including speech the prompt asks a
character to say. The model exposes no separate voice, language or dialogue field, so a spoken line
belongs in the prompt itself.
