# `@narratage/seedream`

Exact author/compute contracts and package-owned author Surfaces for Seedream image generation.

The two modes are separate Surfaces and project the primary result to an ordinary image Artifact.
This package defines what the author requested, not where it runs: API translation, credentials,
retry and queue behavior belong to a selected Runtime Endpoint such as `@narratage/provider-kie`.

The modes stay explicit in the source:

```xml
<seedream:TextImage id="scene" prompt={prompt} aspect-ratio="9:16"
  quality="high" output-format="png" nsfw-check="true"/>

<seedream:ReferenceImage id="variation" prompt={variationPrompt} aspect-ratio="9:16"
  quality="high" output-format="png" nsfw-check="true">
  <seedream:Reference image={scene.image}/>
</seedream:ReferenceImage>
```

Prompt and every reference remain explicit graph inputs; the Runtime chooses no model on the author's behalf.
