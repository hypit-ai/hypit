# Research: object prompts and multi-concept segmentation in Hypit

- Codebase state: `~/projects/hypit` @ `17393e5d` (fork `erdhian73/Hypit-Clone-Any-Video-`), 2026-11-12
- Scope: **internal only** — how the markup surface, capability and provider layers fit together for SAM 3.1, and what blocks per-object masks. No external prior-art pass.
- Question: why is today's SAM integration one concept per Endpoint, and what does "per-object masks as first-class artifacts" actually require of the compiler?

## 1. Today's path, end to end

1. An author writes `<sam:Cutout id="subject" prompt="person" source={shot} format="WEBM"/>`.
2. `packages/sam-cutout/src/index.ts:40-81` declares the surface (`tag: "Cutout"`, attributes id/prompt/source/format) and `packages/sam-cutout/src/index.ts:19-31` the port table behind it: `result: "video"`, ports `prompt` (`text`, `maxItems: 1`), `source` (`media`, one video), `format` (`enum`). The capability name *is* the model name: `sam-3.1-cutout`.
3. `packages/sam-cutout/src/surface.ts:11-57` decodes the element: validates attributes, seals a request draft with `prompt: [prompt.trim()]`, seals the media binding, and emits one component with outputs `{video, alternate}`.
4. `packages/sam-cutout/src/fragment.ts:20-75` builds the fixed graph: bind source → finalize request → `need generation` → `select-primary-video` + `select-alternate-video`.
5. The Runtime binds the Need `@hypit/sam-cutout@1#sam-3.1-cutout` to an Endpoint exposed by a provider. The sample provider in `contrib/providers/meta-model-api/packages/provider-sam-cutout/src/provider.mjs:18-40` declares that capability (and the same service again under `@hypit/volcengine-matting@1#matte-portrait-video`), and `:85` reads the concept as `firstText(ports.prompt) ?? options.concept` — one concept per request.
6. The provider streams masks with a single `input_text` concept per call (`…/src/sam-video.mjs:100-145`) and composites each frame's mask into the alpha channel (`:160+`). `objectId`, `bounds` and per-frame `mask` already arrive per record (`sam-video.mjs:135-145`) — the segmentation service is *already* multi-object; Hypit throws that away above the provider.

## 2. What actually blocks per-object masks

| Layer | Constraint | Anchor |
|---|---|---|
| Markup surface | One element = one component = a **fixed** output map. `components[].outputs` is a static record, so an author cannot ask for N masks unless N is known at compile time. | `packages/sam-cutout/src/surface.ts:50-55`, `packages/markup/src/frontend.ts:270` |
| Port table | `prompt` is capped at one item; a second concept has nowhere to go on the Need. | `packages/sam-cutout/src/index.ts:24` |
| Model family | `result` is restricted to `audio \| image \| video`; an endpoint returns an `AudioSet`, `ImageSet` or `VideoSet` and the graph selects *one* primary. There is no mask artifact family. | `packages/generation/src/ports.ts:81,138`; `packages/generation/src/ports.ts:196-202`; `packages/generation/src/model.ts:747` |
| Provider contract | Capability `sam-3.1-cutout` carries the concept as one text port, so the provider must issue one request per concept and can only return one clip. | `…/provider.mjs:85,151` |
| Artifact identity | Every artifact is a `Blob` with a `mediaType`; there is exactly one Blob type (`packages/blob/src/index.ts:8-10`). "Mask" is a convention, not a type the compiler can check. | `packages/blob/src/index.ts:8-10` |

The last row is the real reason this is a compiler item: an object mask today is indistinguishable from
any other transparent video, so nothing downstream can address *which* object a mask belongs to.

## 3. Two viable shapes

**A. Compile-time object list (fits today's model).** `prompt` becomes a repeated port
(`maxItems: 8`), `also` supplies the extra concepts, and the decoder — which knows the list at compile
time — emits one selector per concept over the returned `VideoSet`. Outputs are named after the
concept (`person`, `ball`), so every mask is an individually addressable Blob. Cost: no kernel type
change; per-object identity lives in the authored names and the selector producers. This is the
same trick `select-alternate-video` already uses for a second video (`packages/sam-cutout/src/fragment.ts:57-66`).

**B. A `MaskSet` artifact family (kernel change).** Add `result: "mask"`, `generationTypes.maskSet`,
a typed object identity (`objectId`, `concept`, `frames`, `bounds`) and selectors. True first-class
masks, but it touches `@hypit/generation` (ports, model, identity, schema), `@hypit/kernel` typing,
admission and the protocol version. It is the right long-term shape and the wrong first step: every
one of those files is consumed by 100+ workspace packages, and the compiler cannot express a
variable-length output map in either case.

## 4. A third option, rejected

Returning a single container (zip/JSON manifest of masks) keeps the model untouched but makes masks
*less* first-class, not more: no per-object addressability in the graph, and consumers must parse the
container. Rejected.

## 5. Live request facts (verified against `api.meta.ai`, SAM 3.1)

`@meta-sam/parser@0.1.0` is public on npm; it now sits in a scratch copy of the provider at
`~/projects/sam-verify` (`contrib/` is outside the workspace, so it could not be installed in-tree).
Three requests were run against a 640×640, 50-frame, 2 s clip:

| request | result |
|---|---|
| one noun phrase (`"person"`) | **works**: 50 mask records, alpha plane present, measured coverage 0.3747, 52 KB WebM |
| two noun phrases (`"person"`, `"ball"`) in one `input_text` list | **0 masks**, outcome `completed` — a request carries exactly one concept phrase |
| `buildObjectPrompt` with object id `7` and one box `(120,60)-(519,599)` | **works**: 50 mask records, all reported under `objectId: "7"`, bounds `{226,61,420,599}` |
| `propagation_direction: forward`, box anchored on frame 0 | 50 masks, frames 0–49 |
| `propagation_direction: backward`, box anchored on frame 0 | **HTTP 400**: "backward propagation needs an object prompt on a frame after the first" |
| `propagation_direction: backward`, box anchored on frame 30 | 31 masks, frames 0–30 — backward tracks only up to the anchor |

Consequences for the design:

- **Multi-concept means N requests.** `prompt="person" also="ball"` cannot be one call; the provider
  must issue one request per concept and concatenate the resulting mask videos in authored order.
  That ordering is the contract `select-mask-N` depends on.
- **Multi-object in one request is the object-prompt path.** `buildObjectPrompt` encodes several
  authored ids into one `input_text` (`<0f>7<|box;...|>`), and the response reports each object under
  that id. The README is explicit that a request "must not combine object prompts with a noun
  phrase", so the two forms are mutually exclusive per request.
- The parser's prompt grammar is documented and validated (`ObjectPromptError`), so geometry
  attributes can be built on it rather than guessed.

## 6. Gaps this pass could not close

- No multi-object **temporal** prompt (same id on several frames, negative points) was exercised; only
  one box on frame 0.
- Nothing here is a claim about SAM 3.1 accuracy, only about request acceptance and response shape.
- `propagation_direction` (how the service tracks objects forward/backward) was not tested.
