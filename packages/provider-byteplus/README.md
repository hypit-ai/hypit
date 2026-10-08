# Direct Byteplus Provider

See [setup, coverage and limitations](../../examples/direct-providers/README.md) and
[model catalog](../byteplus-models/README.md).

Configure `apiKey` as a Hypit CredentialRef, never a raw secret. Optional configuration:
`baseUrl`, `enabledModels`, `allowGatedModels`, `defaultConcurrency`, `actionLimits`,
`pollIntervalMs`, `requestTimeoutMs`, `operationTimeoutMs`. Credentials are not sent to output URLs.

This package uses existing Hypit endpoints and generated-media result types. No paid generation
is performed by installation, import, check, or plan.
