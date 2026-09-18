# `@hypit/wan`

Exact author/compute contracts and package-owned author Surfaces for Wan 2.7 Image and Wan 2.7 Image
Pro.

The model variants are separate endpoints with exact request validation. Their Surfaces project the
primary result to an ordinary image Artifact. The package contains no Provider selection, API key or
network execution. The selected Provider implements its exact capability.

Import the model variant you mean and connect prompt and references as ordinary graph edges:

```xml
<wan:Image id="draft" prompt={prompt} resolution="2K">
  <wan:Reference image={product.image}/>
</wan:Image>

<wan:ProImage id="hero" prompt={heroPrompt} resolution="4K"/>
```

The Surface only lowers this syntax into the package's exact model request. It does not select a
Provider.

Both variants accept prompts up to 5,000 characters and up to nine references, and render at `1K` or
`2K`; the Pro variant adds `4K`. The model takes no aspect ratio: with references present the output
takes the shape of the last one, and a prompt-only element renders at the band's own framing. There
is no negative prompt either, so write exclusions into the prompt.

`count` renders up to four pictures. Setting `image-set` renders one storyline across several
pictures instead, where `count` names a ceiling of up to twelve and the model chooses how many it
returns. An image set shapes a storyline the way `extended-reasoning` shapes a single picture, so the
two are not stated together.
