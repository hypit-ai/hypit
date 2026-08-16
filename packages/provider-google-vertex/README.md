# @narratage/provider-google-vertex

Google Vertex transport for the exact `@narratage/caption-gemini` capability.

This package does not build prompts, parse SVML, inspect WhisperX, choose a model, or rewrite text.
It receives the model package's immutable request, calls `GoogleGenAI({ vertexai: true })` with
structured JSON output, and returns the response only after `@narratage/caption-gemini` validates every
Run, Cue endpoint, atom assignment, field value and per-Cue cardinality.

```ts
createGoogleVertexCaptionProvider({
  project: "my-google-cloud-project",
  location: "global",
  credentialsJson: credentialRef("keychain", "google.vertex.credentials"),
});
```

The Runtime Profile must provide an ordinary `{ store, key }` credential reference. The referenced
value is the JSON contents rather than a path, keeping filesystem authority out of the Provider.
The low-level TypeScript factory retains an environment-reference convenience for embeddings;
declarative Runtime activation has no implicit credential source. Credentials never enter author source, BuildState,
Operation state, Prompt or Receipt metadata.

A host may expose an ADC file through a file-backed CredentialStore, but the Provider itself does
not read arbitrary paths or ambient environment variables.
