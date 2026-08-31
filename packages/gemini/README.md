# `@hypit/gemini`

Provider-neutral Gemini text and multimodal requests for Hypit Author Source.

`<gemini:Generate>` accepts a system instruction, a text prompt and any number of image, video or
audio Artifact references. The model package owns the semantic request and exact model capability;
the selected Runtime Endpoint owns credentials, uploads and the service-specific wire format.

```xml
<gemini:Generate id="describe" model="gemini-3.7-flash"
  instruction={instruction} prompt={prompt}>
  <gemini:Reference media={reference-video}/>
</gemini:Generate>
```

The generated Text is published as `<id>.text`. Switching between
`@hypit/provider-hypihub` and `@hypit/provider-vertex` requires only a Runtime Profile change.
