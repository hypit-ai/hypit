# `@hypit/provider-vertex`

Vertex Gemini Runtime Provider. It fulfils the same Provider-neutral `@hypit/gemini` capabilities
as HypiHub, so a Runtime Profile chooses the backend without changing Author Source. The package
owns the Google GenAI client, credential parsing and the Vertex model ids.

## Runtime Profile

```json
{
  "credentials": {
    "env": { "use": "@hypit/credential-store-env" }
  },
  "endpoints": {
    "vertex.default": {
      "use": "@hypit/provider-vertex",
      "pool": "generation",
      "config": {
        "project": { "store": "env", "key": "GOOGLE_CLOUD_PROJECT" },
        "credentials": { "store": "env", "key": "GOOGLE_APPLICATION_CREDENTIALS_JSON" },
        "location": "global",
        "requestTimeoutMs": 300000
      }
    }
  }
}
```

`project` and `credentials` are both required CredentialRefs. `credentials` is the JSON of a Google
credential: a service account key, or the `application_default_credentials.json` that
`gcloud auth application-default login` writes (an `authorized_user` credential). `location`
defaults to `global`, where the current Gemini models are served. `requestTimeoutMs` bounds each
request; the default is five minutes.

When another selected Endpoint also offers Gemini (HypiHub does), the Profile's `bindings` say which
one serves `@hypit/gemini@1#gemini-3.1-pro`; neither Provider hides the capability.

## Model ids

The capability names the model the author chose; this package maps it to the id Vertex publishes
it under (`gemini-3.1-pro` becomes `gemini-3.1-pro-preview`). A capability without a Vertex id is
refused at activation rather than sent under a name Vertex may not recognise.

## Doctor

`hypit doctor` asks Vertex for each declared model with the configured project and credentials, so a
project without the Vertex AI API enabled, without access to the model, or with a wrong location is
reported before the first paid call, with Vertex's own explanation.

## Embedded use

```ts
import { createVertexGeminiGenerator } from "@hypit/provider-vertex";

const generate = createVertexGeminiGenerator({
  project: process.env.GOOGLE_CLOUD_PROJECT!,
  credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON!,
});
```
