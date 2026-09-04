# `@hypit/gpt-image`

Exact model/compute contracts for GPT Image 2 requests.

One closed Port Table accepts the supported scalar settings and optional reference images. Runtime-
produced references remain explicit Blob edges: the model-owned Draft is bound one edge at a time,
then finalized into the only `GenerationRequest` a Provider can receive. The package owns model
semantics but no API key, Provider selection, queue or network code. `@hypit/provider-kie` is
one optional Runtime implementation.

Provider-specific combination limits are checked by that Provider before any paid operation. They
do not narrow this model-owned vocabulary or leak into author source.

The one physical package exposes two independently importable logical modules:

- `@hypit/gpt-image@1`: the raw exact model;
- `@hypit/gpt-image/clean@1`: generation followed by the existing explicit image-transform
  Program, exporting one cleaned image while retaining both operations in the graph.

Both modules own an `Image` Markup Surface. They use the same author shape, so choosing the clean
module changes the visible graph expansion rather than the document structure:

```svml
<import as="text" from="@hypit/text@1"/>
<import as="gpt" from="@hypit/gpt-image/clean@1"/>

<text:Value id="prompt">
  A woman holding the product, editorial photography.
</text:Value>

<gpt:Image
  id="holding"
  prompt={prompt}
  aspect-ratio="9:16"
  resolution="2K"
>
  <gpt:Reference image={person.image}/>
  <gpt:Reference image={product.image}/>
</gpt:Image>
```

`prompt` is an ordinary `Text` graph edge. Every `Reference` is an ordinary image Artifact edge;
the Surface does not copy runtime media into request metadata. The raw module expands to request
assembly, generation and primary-image selection. The clean module then adds the official
`gptImageDenoiseV1` Program and the shared image-transform Need as one further visible operation.

The Surface implementation belongs to this package. `model-kit` remains responsible only for the
exact request and Fragment shell; it owns no author-Surface registry or model syntax.
