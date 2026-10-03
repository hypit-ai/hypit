# Direct model adapter helpers

Additive helpers used only by the new BytePlus and ElevenLabs packages. No existing Hypit
model, scheduler, renderer or Studio code imports this package.

`createDirectModels` uses the existing exact-model SDK to declare typed requests and a `Generate`
Surface. Media and Text inputs remain graph edges. Scalar ports and media item metadata are validated
by the model definition; unknown fields fail instead of being silently dropped.

`./provider` assembles ordinary immediate/asynchronous Endpoints. Async submission is performed
once; acknowledged task IDs are checkpointed before returning. Polling preserves receipts and
honors 429 Retry-After without retrying submission. Collection refreshes expiring URLs by reading
the same task. Generation is never transient. Explicit old-model aliases validate both the old
contract and the native service contract.

`./transport` provides bounded authenticated API calls and separate unauthenticated asset downloads.
Credentials are resolved by Hypit. API redirects are rejected. Provider error messages redact the
selected key and URLs. This helper imposes no fallback or implicit reuse policy.

Completed media is returned using Hypit's existing generated-media types. Byte validity beyond
HTTP MIME/type/size checks remains the responsibility of Hypit's existing media normalization.
