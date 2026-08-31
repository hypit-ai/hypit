# `@hypit/provider-vertex`

Vertex Gemini backend for callers that need text, image or video inline-data input. The package owns
the Google GenAI client and credential parsing; callers only select the model and provide a generator
input.

```ts
import { createVertexGeminiGenerator } from "@hypit/provider-vertex";

const generate = createVertexGeminiGenerator({
  project: process.env.GOOGLE_CLOUD_PROJECT!,
  credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON!,
  model: "gemini-3.1-pro-preview",
});
```
