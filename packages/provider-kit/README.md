# `@svml/provider-kit`

Trusted Node SDK for defining one configured external-capability Provider from one source of truth.

`defineProviderPackage()` produces all four facts consumed by the local Runtime:

- a static Runtime Module Manifest that can be inspected before implementation code runs;
- a configured endpoint instance and its non-secret `configurationDigest`;
- exact capability/return bindings;
- Driver registration for an immediate handler or recoverable `start/resume/cancel` endpoint.

Provider packages are deployment packages. They are selected by `svml.runtime.ts`, never imported by
author `.svml` source. A package is normally organized by real provider or execution environment,
such as KIE, Volcengine, local WhisperX or AWS HyperFrames, and may expose several models supported
by that provider. It may not infer a creative model from a generic output Type.

```ts
import { defineProviderPackage, wakeAfter } from "@svml/provider-kit";
import { credentialRef } from "@svml/runtime";

export function exampleProvider(options: { apiKeyVariable: string }) {
  return defineProviderPackage({
    module: { name: "@example/provider", version: "1" },
    facet: "generation",
    instance: "example.personal",
    implementation: {
      locator: "@example/provider/generation",
      digest: implementationDigest,
    },
    configuration: { baseUrl: "https://api.example.test" },
    credentials: { apiKey: credentialRef("env", options.apiKeyVariable) },
    permissions: ["network:api.example.test"],
    defaultConcurrency: 2,
    capabilities: [{
      lifecycle: "recoverable",
      capability: exampleCapability,
      returns: exampleProductType,
      retry: { maxAttempts: 3 },
      endpoint: {
        async start({ operation, need, credentials }) {
          const job = await submit(need.constraints, credentials.apiKey!.secret, operation.submissionKey);
          return wakeAfter({ job }, 2_000);
        },
        async resume({ checkpoint, credentials }) {
          return poll(checkpoint, credentials.apiKey!.secret);
        },
        async cancel({ checkpoint, credentials }) {
          await cancelRemote(checkpoint, credentials.apiKey!.secret);
        },
      },
    }],
  });
}
```

Secrets are resolved immediately before invocation and never enter the Runtime Profile, Runtime
Closure, BuildState or Operation journal. Credential slot names, references, retry policy and other
non-secret instance configuration are identity-bound. Changing them creates another Runtime Closure.

`wakeAfter()` is a convenience for a pending checkpoint with an explicit next poll time. Retry is
attempt-level: a retryable terminal failure creates a new content-addressed Operation and submission
key, subject to `maxAttempts`. Process recovery of the same attempt keeps the same submission key.

The current SDK assumes trusted in-process Provider code and a truthful implementation digest.
Community package byte verification and isolation are still future Host work.
