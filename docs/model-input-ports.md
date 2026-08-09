# Model input ports

Status: implemented domain-adjacent contract, 2026-08-08. `svml.generation-ports@1`,
`svml.generation-request@1` and `svml.generation-wire-mapping@1` are executable `@1` contracts.

## The fact this encodes

What an exact generation model accepts—how many reference images, whether it takes reference audio,
whether it supports a first and last frame—is decided when the model is trained. No service reselling
that model can change it. A hundred Providers for one model still describe the same input surface.

Everything a Provider owns is the other half: which HTTP field carries each of those inputs, and
whether that service splits one model across several of its own endpoints.

Narratage therefore separates the two declarations completely. `@narratage/generation` owns the
vocabulary both sides speak; no Provider package depends on any model package.

```text
exact model package                 shared vocabulary              Provider package
────────────────────────           ──────────────────────         ─────────────────────
GenerationPortTable          ───>  svml.generation-ports@1   <───  GenerationWireMapping
  "what I accept"                  svml.generation-request@1        "what I call it"
                                            │
                                            ▼
                                   assertMappingCoversPorts
```

## Port table

A model declares one closed table per exact model. The table is also the Capability name, so
`capability` means *exact model* everywhere—never "mode" and never "model family".

```ts
export const minimaxH3Ports = sealGenerationPortTable({
  contract: "svml.generation-ports@1",
  model: "minimax-h3",
  result: "video",
  ports: [
    { name: "prompt", value: { kind: "text", maxChars: 7_000 }, minItems: 1, maxItems: 1 },
    { name: "referenceImage", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 9 },
    { name: "referenceVideo", value: { kind: "media", accepts: ["video"] }, minItems: 0, maxItems: 3 },
    { name: "referenceAudio", value: { kind: "media", accepts: ["audio"] }, minItems: 0, maxItems: 3 },
    { name: "firstFrame", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 1 },
    // …
  ],
  requires: [
    { kind: "atMostOneOf", ports: ["referenceImage", "firstFrame"] },
    { kind: "requiresAnyOf", port: "referenceAudio", anyOf: ["referenceImage", "referenceVideo"] },
    { kind: "weightedTotal", weights: { referenceImage: 1, referenceVideo: 1, referenceAudio: 1 }, maximum: 12 },
  ],
});
```

The port kinds are closed: `text`, `token`, `enum`, `number`, `boolean` and `media`. So are the
requirement forms: `atMostOneOf`, `requiresPresent`, `requiresAnyOf` (reference audio needs at least
one visual companion) and `weightedTotal` (a shared budget, such as Gemini Omni's documented
`images + videos×2 + characterIds ≤ 7`). A media port may carry `itemFields` plus a
`strictlyIncreasing` item rule, which is how a trimmed excerpt states `endSec > startSec`. Adding a
kind or a requirement form changes the `svml.generation-ports@1` contract while the project remains
pre-release, in the same way `VISUAL_STYLE_NAMES_V1` closes the Visual IR vocabulary. Package locks
and implementation digests record the exact implementation; speculative major numbers do not.

### What a port table deliberately does not encode

The vocabulary states **which ports exist, what each accepts, how many it takes, and which
combinations may appear together**. It does not encode value-level compatibility matrices — GPT
Image 2 excluding `5:4` at 2K, or Gemini Omni capping one excerpt at ten seconds. Chasing those
would grow the vocabulary without bound and put a second, always-stale copy of each service's rules
in the repository. Those requests are formed, submitted and rejected by the service.

`minItems` is Narratage's authoring contract, not the service's. Several services accept an omitted
`resolution` or `aspect_ratio` and apply their own default; a Narratage author states the value.
Enum members and cardinality ceilings are the model's; requiredness is this project's rule that
nothing meaningful is inherited silently.

Everything else is derived from the table:

- `requestSchemaFromPorts` produces the nominal request Type's Schema;
- `verifyRequestAgainstPorts` is the registered semantic validator;
- author Surfaces read their bounds from it—`@narratage/seedance` no longer repeats a reference cap
  in markup validation, and "1080p is standard-only" disappeared entirely because the
  `seedance-2-mini` table simply enumerates `["480p", "720p"]`.

There is no second place to change when a port changes.

## Request envelope

Every model produces the same envelope, so a Provider reads ports by name and never learns a
model-specific field layout:

```ts
{
  contract: "svml.generation-request@1",
  model: "seedance-2-mini",
  ports: {
    prompt: ["A presenter speaks."],
    referenceImage: [{ role: "image", artifact: <BlobRef> }],
    referenceAudio: [{ role: "audio", artifact: <BlobRef> }],
    duration: [5],
  },
}
```

An absent port is an omitted key; a present port always carries at least one value. The old per-mode
discriminated unions are gone: which mode a request is in *is* which ports it populates.

`portsObjectSchema(table, { omit })` states a partial request. `@narratage/seedance` uses it for
`SpeechProgram`, the authored generation that is complete except for the duration only speech
estimation can supply.

## Wire mapping

A Provider ships data, not a translation function:

```ts
{
  contract: "svml.generation-wire-mapping@1",
  capability: { module: { name: "@narratage/minimax-h3", version: "1" }, name: "minimax-h3" },
  result: "video",
  routes: [
    { model: "minimax-h3/image-to-video", whenPresent: ["firstFrame"] },
    { model: "minimax-h3/reference-to-video", whenPresent: ["referenceImage"] },
    { model: "minimax-h3/text-to-video" },
  ],
  fields: {
    referenceImage: { as: "urlArray", field: "reference_image_urls" },
    referenceVideo: { as: "urlArray", field: "reference_video_urls" },
    firstFrame: { as: "url", field: "first_frame_url" },
    // …
  },
}
```

`routes` carries the service's own shape. KIE exposing one MiniMax model as three URLs is a KIE
fact; another service may expose one. The mapping binds the exact module *version* as data, so a
mapping written for one model version cannot silently serve another.

`compileWireRequest(mapping, request, resolve)` is a pure engine in `@narratage/generation`. It needs
the mapping and the request only—never the port table—so it runs inside a Provider that imports no
model package. `resolve` is supplied by the Provider, which is what keeps artifact upload out of the
shared vocabulary.

## Where the numbers come from

The split above is only honest if a limit really is invariant across services. It is. Seedance 2's
reference capacity is stated identically by ByteDance's own launch material, by KIE and by fal:

| Fact | ByteDance | KIE | fal |
|---|---|---|---|
| reference images | 9 | 9 | 9 |
| reference videos | 3 | 3 | 3 |
| reference audio | 3 | 3 | 3 |
| total files across modalities | 12 | — | 12 |
| audio needs a visual companion | — | — | yes |

Only the field names differ: KIE writes `reference_image_urls`, fal writes `image_urls`, and the two
services use different prompt-reference syntax. That is exactly the line between the port table and
the wire mapping.

Two details confirm the same rule elsewhere. MiniMax's `768P` and `2K` are its own two rendering
tiers, not a gateway's spelling. And KIE's `minimax-h3/image-to-video` endpoint omits `aspect_ratio`
entirely because a first-frame run inherits its framing from the uploaded image — a model fact,
recorded here as `atMostOneOf: [aspectRatio, firstFrame]`, not a gateway quirk.

Provenance of the current tables, so a later reader knows what was actually checked:

| Model | Cross-checked against a second source | Single-source (KIE) |
|---|---|---|
| `seedance-2`, `-fast`, `-mini` | ByteDance launch material, fal | — |
| `minimax-h3` | MiniMax H3 published specs | — |
| `gemini-omni-video` | — | limits and quota formula |
| `gpt-image-2` | — | both endpoint schemas |
| `nano-banana-2` | — | text schema; `-pro` assumed identical |
| `seedream-5-lite` | — | text schema; image-variant array cap unverified |
| `grok-imagine-video`, `-1.5-preview` | — | text schema; image-variant fields unverified |

## Coverage

`assertMappingCoversPorts(table, mapping)` is the check the previous hand-written translators could
not perform. It proves a mapping writes every declared port and every required item field, names no port the
model does not declare, and never writes one wire field from two ports. Matching is by the full
Capability including the module version, so a mapping written against an older model version fails
here rather than at submission time.

Forgetting `reference_audio_urls` used to surface only after a paid generation came back without the
voice reference. `packages/provider-kie/test/models.test.ts` now fails on it before any spend, and
asserts that explicitly by deleting the audio port from the real Seedance mapping.

Model semantics are validated once, by Core, through the registered validator. The Provider re-checks
only that it can write every port present in the request (`mappingSupportsRequest`), which removed a
duplicated validation pass from the KIE endpoint.

## Boundary

`tools/package-boundaries.test.mjs` asserts that no `@narratage/provider-*` package has a production
dependency on any exact-model package, and that both sides meet at `@narratage/generation`. Adding a
model no longer edits a Provider; adding a Provider no longer re-implements every model. The
relationship is N+M.

Current status is recorded in [`implementation-status.md`](./implementation-status.md); the shared
Capability and Endpoint rules are in [`architecture.md`](./architecture.md) §6.

## What this makes cheap next

Adding a service is now a mapping file plus its transport, with no model package touched and no Core
release. The planned next phase brings the common aggregator services in as a batch on that basis;
its scope, the optimisations deliberately deferred until several mappings exist, and the two rules
that hold throughout are recorded in [`roadmap.md`](./roadmap.md) B4.
