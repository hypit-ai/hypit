# `@hypit/gpt-image`

Exact model/compute contracts for GPT Image 2 requests.

The package owns the complete GPT Image request contract: supported scalar settings, optional
reference images, validation and the request-producing graph step. Runtime-produced references
remain explicit Blob edges. The field-oriented builder is only this package's authoring choice; the
Provider receives the finalized, model-owned request and does not depend on a Generation-wide
request ontology. This package owns model semantics but no API key, Provider selection, queue or
network code. The selected Provider implements its exact capability.

Provider-specific combination limits are checked by that Provider before any paid operation. They
do not narrow this model-owned vocabulary or leak into author source.

The one physical package exposes two independently importable logical modules:

- `@hypit/gpt-image@1`: the raw exact model;
- `@hypit/gpt-image/clean@1`: generation followed by an explicit shared image transform
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

Set the optional `background` attribute to `transparent` when the generated image should carry
alpha, `opaque` when every output pixel should be opaque, or `auto` when the model should choose.
Omitting it leaves that choice to the model and selected Provider. Provider-specific combinations,
including which resolution tiers accept an explicit background choice, are reported by that
Provider before generation.

`prompt` is an ordinary `Text` graph edge. Every `Reference` is an ordinary image Artifact edge;
the Surface does not copy runtime media into request metadata. The raw module expands to request
assembly, generation and primary-image selection. The clean module then adds its package-owned
`gptImageCleanupProgram` and the shared `Transform` Need as one further visible operation. The
generic image-operations package owns the Program shape and operation semantics; this package owns
the selected cleanup recipe.

The Surface implementation belongs to this package. The public
`@hypit/generation/model` helpers remain responsible only for the exact request and Fragment
shell; they own no author-Surface registry or model syntax.
