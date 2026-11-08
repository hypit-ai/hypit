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

The package exposes one exact `@hypit/gpt-image@1` module and one `Image` author declaration:

```svml
module prompt from "@hypit/prompt@1"
module gpt from "@hypit/gpt-image@1"

prompt.Prompt "direction" {
  text: "A woman holding the product, editorial photography."
}

gpt.image {
  id: holding
  prompt: @direction
  aspect-ratio: 9:16
  resolution: 2K
  Reference "person" { image: @person-image }
  Reference "product" { image: @product-image }
}
```

Set the optional `background` attribute to `transparent` when the generated image should carry
alpha, `opaque` when every output pixel should be opaque, or `auto` when the model should choose.
Omitting it leaves that choice to the model and selected Provider. Provider-specific combinations,
including which resolution tiers accept an explicit background choice, are reported by that
Provider before generation.

`prompt` is a nominal `Prompt` graph edge. Every `Reference` is an ordinary image Artifact edge.
The module expands to request assembly, generation and primary-image selection. It returns the
Provider's selected image unchanged. Denoising, grading or other project-specific asset preparation
is not hidden inside the model contract.

The declaration compiler belongs to this package. The public
`@hypit/generation/model` helpers remain responsible only for the exact request and Fragment
shell; they own no author syntax registry or model syntax.

## Generation Graph node

The package contributes `@hypit/gpt-image@1#gpt-image-2.image` through its own
`hypit.generation-node-package@1` facet. Generation Graph Core has no GPT Image component list or request branch.
The node keeps exact model settings explicit and accepts zero to sixteen indexed image edges:

```json
{
  "id": "walking",
  "using": {
    "module": { "name": "@hypit/gpt-image", "version": "1" },
    "name": "gpt-image-2.image"
  },
  "inputs": {
    "prompt": { "value": "The same presenter walking through the studio." },
    "aspectRatio": { "value": "9:16" },
    "resolution": { "value": "2K" },
    "images.1": { "node": "holding" }
  }
}
```

`aspectRatio` and `resolution` remain required because the exact model has no authored defaults for them;
`background` remains optional. Prompt may be an inline string or a connected nominal `Prompt`. Repeated images use
the common Field Model Graph helper, so cardinality and media-role validation come from `gptImage2Fields` rather
than a second Graph-specific schema.

A GPT Image output is an ordinary image `Blob`. It can feed another GPT Image node and a Seedance reference-video
node in the same Build. A shared upstream node is still one operation; multiple consumers do not duplicate it.
