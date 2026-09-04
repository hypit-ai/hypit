# `@hypit/grok-imagine`

Exact author/compute contracts and package-owned author Surfaces for Grok Imagine video generation.

It exposes the standard and 1.5-preview models as distinct Surfaces. Each request is nominally typed and
validated before yielding an ordinary video Artifact. The package declares the model
choice; it does not route to another model or access a Provider. `@hypit/provider-kie` is one
optional Runtime implementation.

```xml
<grok:Video id="clip" prompt={prompt} duration="6" aspect-ratio="9:16" resolution="720p">
  <grok:Reference image={person.image}/>
</grok:Video>

<grok:PreviewVideo id="preview" prompt={previewPrompt} duration="6"
  aspect-ratio="9:16" resolution="720p"/>
```

Both Surfaces accept up to seven reference images. `Video` accepts 6–30 seconds; `PreviewVideo`
accepts 1–15 seconds and also offers `auto` aspect ratio. Provider task identifiers are execution
state, not author inputs, and are deliberately absent from both Surfaces.
