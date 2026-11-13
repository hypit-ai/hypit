# Plan: multi-object segmentation for SAM 3.1 (`<sam:Segment>`)

- Research: [research-sam-object-prompts.md](./research-sam-object-prompts.md)
- Codebase state: `~/projects/hypit` @ `17393e5d`
- Goal: an author writes `<sam:Segment id="tracked" prompt="person" also="ball"/>` and receives one
  mask artifact per object, addressable by name, instead of one concept per Endpoint.

## Design decision

Adopt **shape A** from the research (compile-time object list): the object list is authored, so the
decoder can emit a static selector per concept over the `VideoSet` the endpoint returns. Shape B
(`MaskSet` in the kernel) is the long-term target and is explicitly out of scope; §Risks records what
it would take.

New capability: `@hypit/sam-cutout@1#sam-3.1-segment` (`result: "video"`, one mask video per object).
New surface: `sam:Segment`.

## Phase 1 — compiler capability (this change)

1. `packages/sam-cutout/src/index.ts`
   - `samSegmentPorts`: `prompt` text `minItems: 1, maxItems: 8`; `source` one video; `format` WEBM|MOV.
   - second endpoint on the existing module: key `segment`, `requestTypeName: SamSegmentRequest`,
     `producerName: request-sam-segment`.
   - `samSegmentSurface` (`tag: "Segment"`): attributes `id`, `prompt`, `also`, `source`, `format`;
     example `<sam:Segment id="tracked" prompt="person" also="ball"/>`.
   - `samSegmentProducers.maskAt(ordinal)` for ordinals 1..8 — static producers, because a module
     manifest cannot declare a producer whose behaviour depends on runtime input.
2. `packages/sam-cutout/src/segment-surface.ts` — decode: exact attribute set, non-empty prompt,
   comma-split `also`, trim/dedupe, ≤ 8 concepts, slug-safe output names, one component with an
   output per concept.
3. `packages/sam-cutout/src/segment-fragment.ts` — bind source → finalize → `need generation` →
   `select-mask:000N` per concept; exports one Blob per concept slug.
4. `packages/sam-cutout/src/activation.ts` — register the surface, the eight selector producers and
   their handlers, alongside the existing cutout ones.
5. `packages/sam-cutout/test/segment.test.ts` — decode tests: two concepts produce two named outputs
   and two selectors; duplicates rejected; > 8 rejected; empty prompt rejected; unknown attribute
   rejected; non-video source rejected.

Acceptance: `pnpm run check` clean; `node --test packages/sam-cutout/test/segment.test.ts` green;
`pnpm test` still 0 failures.

## Phase 1 status — delivered and verified (settings pass included)

`pnpm run check` clean; `node --test packages/sam-cutout/test/segment.test.ts` 16/16 pass.

Settings now surfaced on `sam:Segment`:

| setting | attribute | port | rule enforced in the decoder |
|---|---|---|---|
| object list | `prompt` + `also` | `prompt` (0–8 text) | one noun phrase per request, duplicates rejected |
| geometry objects | `<sam:Object name box points frame/>` | `objects` (0–8 text, one JSON per object) | exactly one of box/points per object, normalised 0–1, box ordered, 1–16 points with optional `neg` |
| request form | — | `atMostOneOf: [prompt, objects]` | mixing noun phrases with geometry is refused (the API rejects it) |
| tracking window | `propagation` | `propagation` (enum both/forward/backward) | `backward` requires an Object anchored on a frame > 0 (measured: the API returns HTTP 400 otherwise) |
| confidence floor | `min-confidence` | `minConfidence` (number 0–1) | range checked; service returned no confidence on the probe runs, so the floor is a no-op until it does |
| container | `format` | `format` (WEBM/MOV) | unchanged |

`objects` port payload — the provider scales these to source pixels and feeds `buildObjectPrompt`:
`{"name":"left hand","frame":0,"box":[0.19,0.09,0.81,0.94]}` or
`{"name":"face","frame":12,"points":[{"x":0.5,"y":0.3},{"x":0.42,"y":0.36,"negative":true}]}`.

**Correction to the earlier proposal:** `masks="video|rle|png"` is not expressible with this
endpoint. `result: "video"` means the provider returns a `VideoSet`; RLE JSON has no artifact family
at all, and per-object PNG frames would need an image-result endpoint plus one sprite per object.
Those are recorded as Phase 2c, not built.

## Phase 2 — provider (live facts now known, work not started)

Measured against `api.meta.ai` with SAM 3.1 (see the research §5 table): one noun phrase per request
(two phrases return **0 masks**), and `buildObjectPrompt` carries several authored object ids in one
`input_text`.

- `sam-video.mjs`: accept `concepts: string[]`, run **one request per concept**, and return mask
  videos in the authored order with `objectId`/`concept` retained.
- `provider.mjs`: declare `sam-3.1-segment` with `supports()` accepting 1–8 prompts, and return one
  video per concept in the `VideoSet` — that ordering is what makes `maskAt(n)` mean "the n-th
  authored object".
- Second surface form (phase 2b): geometry prompts via `buildObjectPrompt`, where one request carries
  several object ids and the provider splits the response by `objectId` into one video per id.
  Deferred because it needs its own attribute grammar (frame + box/points + positive/negative) and a
  decision about coordinate normalisation.

## Phase 3 — masks as a kernel type (out of scope, recorded)

`result: "mask"` + `generationTypes.maskSet` in `@hypit/generation`, typed object identity, and
selectors that carry `objectId`/`concept`/frame range. Touches ports, model, identity, schema,
admission and the protocol version; every workspace package consumes those files, so it needs its own
research pass and a version bump.

## Risks

- **Output-map cardinality**: Hypit components have static outputs. A mask count that is only known at
  runtime cannot be expressed; the 8-concept ceiling is a deliberate compile-time limit, not an
  oversight.
- **Ordering contract**: `maskAt(n)` is only meaningful if the provider returns set entries in the
  authored concept order. Phase 1 cannot enforce that; the provider must document and test it.
- **Name collisions**: `prompt="red ball"` and `also="ball"` would both slug to `ball`. The decoder
  rejects duplicate slugs rather than silently merging.
- **No live verification**: the SAM service is not reachable from this machine (`@meta-sam/parser`
  absent, no API key exercised). Phase 1 is verified as compiler behaviour only.
