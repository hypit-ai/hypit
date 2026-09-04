# `@hypit/gemini`

Provider-neutral Gemini multimodal observation requests.

`<gemini:Generate>` accepts a system instruction, a text prompt and any number of image, video or
audio Artifact references. The model package owns the semantic request and exact model capability;
the selected Runtime Endpoint owns credentials, uploads and the service-specific wire format.

```xml
<gemini:Generate id="describe" model="gemini-3.1-pro"
  instruction={instruction} prompt={prompt}>
  <gemini:Reference media={reference-video}/>
</gemini:Generate>
```

The answer is a nominal `VisualObservation`, published as `<id>.observation`. It deliberately is not
`@hypit/text` Prompt input: Gemini supplies visual evidence to the author; it does not silently write
production prompts inside a Build. Reference-video work should normally call the creation-time
`hypit observe` command, inspect the observation, and then author the production Source.

Switching between
`@hypit/provider-hypihub` and `@hypit/provider-vertex` requires only a Runtime Profile change.
