# `hypit/model-kit`

Author-model package helper for defining exact generated-media requests without repeating the
nominal Type → Producer → Need → Graph Fragment shell.

An external model package develops against the public `hypit/model-kit`, `hypit/generation`, and
`hypit/author-kit` subpaths. The released `hypit` Distribution is its framework development
dependency; the model ships its own compiled JavaScript, Sources, and assets.

## Declare the authored request

For example, a model's request can have one prompt and a chosen output shape:

```ts
import { defineExactModelModule } from "hypit/model-kit";
import { sealGenerationPortTable } from "hypit/generation";

const ports = sealGenerationPortTable({
  model: "studio-image-v1",
  result: "image",
  ports: [
    { name: "prompt", value: { kind: "text" }, minItems: 1, maxItems: 1 },
    { name: "aspectRatio", value: { kind: "enum", values: ["1:1", "9:16"] }, minItems: 1, maxItems: 1 },
  ],
  requires: [],
});

export const model = defineExactModelModule({
  module: { name: "@studio/image-model", version: "1" },
  endpoints: [{ key: "image", requestTypeName: "ImageRequest", producerName: "generate-image", ports }],
});
```

The model name, ports, supported values, and cardinalities above are illustrative; declare the actual
model's author-visible semantics. A service-specific subset belongs in its Provider's `supports`.
Adding a new service for this request leaves the Model unchanged.

The definition supplies the Module Manifest, component handlers, exact-model Host facet, and each
endpoint's request Types and generation Fragment. Export the Manifest in the package activation's
`modules`, the component in `components`, and its Host facet in `hostFacets`. An Author Surface uses
`hypit/author-kit` to read Source and connects authored Text and media edges through
`createExactModelPrimaryGenerationFragment`. It publishes the resulting image, video, or audio as a
normal Output. See the public function types for the returned values and Fragment inputs.

The Model declares the Need; a separately selected Provider must implement its exact Capability and
result Type. Source selects the Model, while the Runtime Profile selects the Provider Endpoint.

`defineExactModelModule` does not make model requests generic. The calling package still owns its
exact fields, constraints, model identity, capability name and validator. The helper adds no
Provider routing, fallback, credentials or Runtime authority.

This is a package-authoring utility, not an author-importable model by itself.
