# `@hypit/seedream`

Exact author/compute contracts and package-owned declarations for Seedream image generation.

The two modes are separate declarations and project the primary result to an ordinary image Artifact.
This package defines what the author requested, not where it runs: API translation, credentials,
retry and queue behavior belong to a selected Runtime Endpoint selected in the Runtime Profile.

The modes stay explicit in the source:

```svml
module seedream from "@hypit/seedream@1"

seedream.text-image {
  id: scene prompt: @prompt aspect-ratio: 9:16
  quality: high output-format: png nsfw-check: true
}

seedream.reference-image {
  id: variation prompt: @variationPrompt aspect-ratio: 9:16
  quality: high output-format: png nsfw-check: true
  Reference { image: @scene.image }
}
```

Prompt and every reference remain explicit graph inputs; the Runtime chooses no model on the author's behalf.
