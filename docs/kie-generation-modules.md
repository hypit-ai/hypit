# KIE generation modules

Status: implemented model contracts and recoverable Provider; representative live-account smoke
passed on 2026-08-06.

## Boundary

The release contains three separate kinds of package:

```text
author model module      exact request Type + Capability + Need Producer + Fragment
@narratage/generation         shared generated image/video Product contracts
@narratage/provider-kie       KIE upload, submission, recovery, download and exact bindings
```

An author module says which model and mode is intended. The KIE package says how KIE realizes that
exact request. Runtime configuration selects the KIE implementation but cannot turn Seedance into
Grok, choose a model from a generic `speaker` declaration, or mutate a safety field.

The current seven families expose eleven exact capabilities—one per exact model. Where KIE splits a
model across several of its own endpoint slugs, that split is a route in this package's wire mapping
rather than an extra Capability. This package imports no model package; it maps the input ports each
model declares. See [`model-input-ports.md`](./model-input-ports.md).

## Content-addressed references

Model requests contain `BlobRef`s, not public URLs. During `start`, the KIE Provider:

1. verifies that each digest exists in the selected ArtifactStore and its byte count matches;
2. uploads it to KIE's temporary file service with a content-derived filename;
3. constructs the endpoint-specific KIE JSON body;
4. submits one paid task and checkpoints its `taskId`.

The temporary URL is a transport fact and is absent from request identity. A filesystem Artifact
Store and an S3 Artifact Store therefore produce the same author request digest.

## Result law

Provider results are atomic `GeneratedImageSet` or `GeneratedVideoSet` Products. They bind:

- one or more content-addressed result artifacts;
- a digest over the complete Product.

The exact model, mode, requested duration and request digest remain on the selected author
request/Need and its Receipt. Repeating them in the provider-neutral Product would create a second
lineage channel beside the Graph and Derivation.

The set is one Product, not a Producer with independently replaceable fields. A later explicit
Projection may expose one variant as its own Candidate. Satisfaction operates on Logical Outputs;
it never mutates part of an atomic remote Product.

## Safety and project Recipes

Grok is exposed only for video. Seedream is exposed for image generation and requires explicit
`nsfwCheck`. A project Recipe may choose Grok video or Seedream image and set their exact parameters.
Content treatment is not a Provider capability and does not authorize Runtime to route arbitrary
requests.

## Current verification

The model slugs and request fields were checked against KIE's current Market and File Upload API
documentation on 2026-08-06 and rechecked on 2026-08-08, when several limits recorded in the port
tables were corrected; Seedance and MiniMax were additionally cross-checked against ByteDance, fal
and MiniMax's own published specifications. Tests cover all seven family identities, Gemini's weighted reference
quota, explicit Seedream safety identity, Blob upload, recoverable polling, immediate artifact
persistence, missing-checkpoint recovery, HTTP-200 business rejection and ambiguous-submission
no-retry behavior.

An opt-in credentialed run passed one representative endpoint from all seven families plus one
real synthetic-reference upload. It also proved that rerunning the same completed Build consumes no
additional credits. The repeatable command and supported case names live in the Provider package
README rather than a dated result transcript.

The repository contains no credential. One live run cannot guarantee future availability, prices,
moderation behavior or undocumented enum changes, and most exact endpoint variants have not received
a paid live call. The image-variant array caps for Seedream, Grok Imagine and Nano Banana Pro remain
single-source and unverified; their per-model provenance is recorded in
[`model-input-ports.md`](./model-input-ports.md).

Generated video bytes remain raw Provider Products. Their all-stream inspection, attached-picture
selection and shared-origin A/V normalization are owned by the separate
[`Media Inspection and Normalization`](./media-inspection-and-normalization.md) pipeline.

## Documentation references

- KIE Market task lifecycle and result shape: <https://docs.kie.ai/market/common/get-task-detail>
- file stream upload: <https://docs.kie.ai/file-upload-api/upload-file-stream/>
- Seedance 2.0 Mini (the same request family is used for 2.0 and Fast):
  <https://docs.kie.ai/market/bytedance/seedance-2-mini>
- MiniMax H3: <https://docs.kie.ai/market/minimax-h3/text-to-video>
- Gemini Omni Video: <https://docs.kie.ai/market/gemini-omni-video>
- Grok Imagine video: <https://docs.kie.ai/market/grok-imagine/text-to-video>
- GPT Image 2: <https://docs.kie.ai/market/gpt/gpt-image-2-text-to-image>
- Nano Banana 2 and Pro: <https://docs.kie.ai/market/google/nanobanana2>
- Seedream 5 Lite: <https://docs.kie.ai/market/seedream/5-lite-text-to-image>
