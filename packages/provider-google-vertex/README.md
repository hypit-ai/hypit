# @svml/provider-google-vertex

Google Vertex transport for the exact `@svml/caption-gemini` capability.

This package does not build prompts, parse SVML, inspect WhisperX, choose a model, or rewrite text.
It receives the model package's immutable request, calls `GoogleGenAI({ vertexai: true })` with
structured JSON output, and returns the response only after `@svml/caption-gemini` validates every
Run, Cue endpoint, atom assignment, field value and per-Cue cardinality.

```ts
createGoogleVertexCaptionProvider({
  project: "my-google-cloud-project",
  location: "global",
});
```

The default credential reference is the explicit environment key
`GOOGLE_APPLICATION_CREDENTIALS_JSON`, whose value is the JSON contents rather than a path. This
keeps filesystem authority out of the Provider. A deployment may bind another `CredentialStore`
and pass its `CredentialRef`. Credentials never enter author source, Runtime Closure, BuildState,
Operation state, Prompt or Receipt metadata.

The old `twinit` implementation used `GOOGLE_APPLICATION_CREDENTIALS` as an ADC file path. A host
may preserve that deployment mechanism in a file-backed CredentialStore, but the Provider itself
does not read arbitrary paths or ambient environment variables.
