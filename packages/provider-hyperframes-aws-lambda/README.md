# `@narratage/provider-hyperframes-aws-lambda`

Recoverable AWS Step Functions/Lambda implementation of the exact
`@narratage/render-hyperframes#render-visual` capability.

The Endpoint stages the immutable `HyperframesDocument` with the shared
`stageHyperframesProject()` layout, uploads that content-addressed site, starts one distributed
render and journals its execution ARN. Its Step Functions execution name is derived from the
Runtime Operation id, so recovery cannot accidentally submit the same attempt twice.
Cancellation uses that same identity to stop the remote Step Functions execution, including the
crash window before the first checkpoint was saved.

The distributed HyperFrames contract supports only integer 24, 30 and 60 fps. Unsupported Needs
are declined by `supports()` so another Endpoint may satisfy them; no frame rate or GPU intent is
silently changed. The Provider always requests strict SDR H.264, exact CFR assembly, software
browser rendering and plan protocol v2. It also declines Surface-bearing documents until the
remote route owns the same byte verifier as the local Endpoint. Chunking remains deployment
configuration.

On success the Endpoint requires HyperFrames' plan and completed-frame counts to equal the source
document, then streams the returned S3 object into the selected content-addressed ArtifactStore.
Configuration must include the reviewed deployed renderer's content digest; a mutable state-machine
ARN is not implementation identity. That digest and the document digest are repeated in
receipt-covered renderer-attestation metadata, while the Driver independently binds the locked
Endpoint/configuration/Runtime closure in the generic Need Receipt.
This is a renderer execution receipt, not an ffprobe claim about the MP4 byte stream. Container and
stream conformance stays in the explicit media inspection/mux capabilities, so the orchestrating
machine does not acquire a hidden FFmpeg dependency.

The production client uses the AWS SDK default credential chain. No access key is accepted by the
package configuration or written into Runtime identity.

See [`docs/hyperframes-aws-runtime.md`](../../docs/hyperframes-aws-runtime.md) for Runtime Profile
configuration, recovery semantics, deployment review and the opt-in live canary. The canary uses a
fresh operation identity on every run and cleans its exact render/site prefixes by default.
