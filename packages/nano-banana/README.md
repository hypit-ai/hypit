# `@hypit/nano-banana`

Exact author/compute contracts and package-owned author Surfaces for Nano Banana 2 and Nano Banana Pro.

The model variants are separate endpoints with exact request validation. Their Surfaces project the
primary result to an ordinary image Artifact. The package contains no Provider selection, API key or
network execution; `@hypit/provider-kie` is one optional Runtime implementation.

Import the model variant you mean and connect prompt and references as ordinary graph edges:

```xml
<nano:Image id="draft" prompt={prompt} aspect-ratio="9:16" resolution="2K" output-format="png">
  <nano:Reference image={person.image}/>
</nano:Image>

<nano:ProImage id="final" prompt={finalPrompt} aspect-ratio="9:16" resolution="4K" output-format="png"/>
```

The Surface only lowers this syntax into the package's exact model request. It does not select a Provider.

Nano Banana 2 accepts prompts up to 20,000 characters, up to 14 references and its wider aspect-ratio
set. Nano Banana Pro accepts prompts up to 10,000 characters, up to eight references and the ratios
its exact model exposes; the two Surfaces do not share a guessed common request table.
