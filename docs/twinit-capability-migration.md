# Twinit capability migration ledger

Status: current migration inventory, 2026-08-10. This document is an execution ledger, not a
compatibility promise. Twinit's active production canvas is the audit source; Narratage keeps old
outcomes only when they fit the current graph, peer-Track and explicit-provider laws.

## Status vocabulary

- **Complete:** a current author package or graph composition provides the production outcome.
- **Expressible; Kit missing:** current model/graph contracts can express the request, but the old
  named author experience and Prompt Kit have not been migrated.
- **Backlog:** technically compatible with the architecture, but no current package provides it.
- **Deliberately omitted:** consciously outside the current product or architecture; not accidental.

These states must not be collapsed into “mostly migrated.” A low-level model port is not the same as
a finished author package, and a deferred package is not an impossible feature.

## Active-node inventory

| Twinit node | Status | Current replacement or remaining work |
|---|---|---|
| `input` | Complete | Author Source values and explicit graph edges replace a special canvas input node. |
| `gpt_image_2` | Complete | `@narratage/gpt-image`, KIE and the optional `@narratage/gpt-image/clean` graph composite; runtime-produced references are explicit Blob edges and cleanup still uses the shared `image-transform` operation. |
| `grok_image` | Deliberately omitted | The current exact-model catalog intentionally exposes Grok only for video. A future image model package remains possible. |
| `mimo_tts` | Complete | `@narratage/mimo-tts` declares three exact author-selected models; `@narratage/provider-xiaomi-mimo` independently realizes them through Xiaomi's official API and returns a generic audio Artifact. |
| `image_chroma_key` | Complete | The misleading old name is retired. `@narratage/background-removal` declares image-in/image-out intent and KIE fulfills it through Recraft `remove-background`; another Endpoint may implement the same exact capability. |
| `image_overlay` | Complete | `@narratage/image-compose` replaces the fixed base/sticker special case with an explicit Canvas and ordered image Layers; the local OpenCV Endpoint produces one reusable PNG Artifact. |
| `estimate_duration` | Complete | `@narratage/estimate` plus an explicit SVS policy. |
| `speech_script` | Complete | Script/Narrative, Segment and Role projections, Selection/Moment anchors and Caption atoms. |
| `text_concat` | Backlog | A generic deterministic string-assembly component is not currently published. Prompt Kit does not replace every graph-level use. |
| `text_replace` | Backlog | A generic deterministic replacement component is not currently published. |
| `seedance_avatar` | Complete | The official Seedance Speaker path covers the single-speaker reference-image/audio case. |
| `seedance_speaker` | Complete | `@narratage/seedance-speaker` with one explicit six-axis Prompt Kit and SVS invocation. |
| `seedance_broll` | Expressible; Kit missing | Generic Seedance now accepts runtime-produced image/audio/video edges; a tested three-image montage topology exists. Only the named Prompt author Kit is intentionally deferred. |
| `seedance_podcast` | Expressible; Kit missing | Seedance accepts the required multimodal references; the two-speaker podcast Prompt Kit and author Surface are absent. |
| `seedance_call` | Expressible; Kit missing | Model ports exist; the call-layout Prompt Kit and author Surface are absent. |
| `seedance_street_interview` | Expressible; Kit missing | Model ports exist; the street-interview Script/Prompt Kit is absent. |
| `seedance_keyframe` | Expressible; Kit missing | Seedance exposes explicit first/last-frame ports; no dedicated convenience Surface is shipped. |
| `seedance_reference` | Expressible; Kit missing | Seedance exposes image/video/audio reference ports; no old-style named reference Kit is shipped. |
| `seedance_motion_ref` | Expressible; Kit missing | Reference-video input exists; the motion-only semantic Prompt Kit is absent. |
| `seedance_camera_ref` | Expressible; Kit missing | Reference-video input exists; the camera-only semantic Prompt Kit is absent. |
| `concat` | Complete | Ordered Media/Speech graph composition replaces clip concatenation as a special node. |
| `base_track` | Complete | Speech Spine, Media Track and Film replace the privileged base lane. |
| `video_enhance` | Backlog | Add an explicit video-in/video-out enhancement component and Provider profile if delivery needs it. |
| `broll_track` | Complete | Unified `@narratage/media-track` Item/Sequence authoring; the old B-roll package is retired. |
| `deck_track` | Complete | `@narratage/deck-track` implements the independent DepthStack collection model. |
| `cluely_ui_track` | Deliberately omitted | Product-specific UI recreation was explicitly removed from the migration scope. |
| `comment_sticker_track` | Complete | Independent `@narratage/comment-sticker` Style/Track Surfaces lower explicit content, Spatial Frames and shared Temporal projections to a self-contained peer Visual Track. |
| `text_track` | Complete | `@narratage/text-track` implements Point/Area/Path text, rich paint, boxes, layout, masks and motion. |
| `subtitle_track` | Complete | Caption Plan, Gemini planner and `@narratage/caption-fine` replace the monolithic subtitle node. |
| `fx_track` | Deliberately omitted | Base/lower-composite sampling violates peer self-contained Track laws; no placeholder is reserved. |
| `audio_track` | Complete | `@narratage/audio-track` provides exact sample-domain placement, playback, fades and mixing inputs. |
| `screen_fx_track` | Complete | `@narratage/screen-overlay` provides self-contained full-canvas peer Tracks without reading lower pixels. |
| `ranking_track` | Complete | `@narratage/ranking` exposes TierBoard, Column, TopThree and TypewriterList as separate components. |
| `locate` | Complete | WhisperX evidence, Speech Alignment, SemanticMap, Temporal, Spatial and Film replace one privileged locate phase. |
| `export` | Complete | Composition, HyperFrames document compilation, visual rendering, audio rendering and mux are explicit graph operations. |

Totals: **21 Complete**, **8 Expressible; Kit missing**, **3 Backlog**, **3 Deliberately omitted**.

## Retired behavior inside migrated families

- Caption importance fields and random word sizing were explicitly removed; Fine Caption is the
  first field-free style family. A future dual-font editorial style is a separate package, not a
  hidden mode inside Fine.
- LLM text rewriting is absent by design. Script remains the sole text truth; speech recognition is
  timing evidence only.
- Hidden B-roll ordering/repair, lane-global SFX, automatic cache reuse and Runtime-selected creative
  fallback are absent by design. Author and Run graphs express those choices explicitly.
- Cross-Track masks, adjustment layers and Base FX remain incompatible with the current peer-Track
  contract. A component may transform only pixels and audio it owns.

## Package naming debt before publication

The physical package taxonomy is mostly regular: `provider-*`, `artifact-store-*`,
`credential-store-*`, `transport-*`, `*-track`, `*-local`, `*-aws-lambda` and `*-node` communicate
their roles. The following names need one deliberate pre-publication decision rather than piecemeal
renaming:

| Current name | Ambiguity to resolve |
|---|---|
| `@narratage/text` | It is the SVML markup Frontend, while `text-track` is video text. |
| `@narratage/run-text` | It is also a Frontend, but the role is not named consistently with `text`. |
| `@narratage/compiler-text-node` | It is a Node compiler assembly selecting the Text Frontend; the word order obscures that. |
| `@narratage/local` | It is a Node local Runtime/developer distribution, not a generic notion of locality. |
| `@narratage/hyperframes` / `render-hyperframes` | One compiles terminal Visual IR; the other is the author-visible render graph package. |
| `@narratage/media-pipeline` / `media-execution` | One owns provider-neutral contracts and plans; the other is the shared FFmpeg execution body. |

No rename should happen until the complete mapping is chosen, updated atomically and protected by a
repository test.

## Version invariant

Three identities are different facts:

1. public wire, Frontend and logical Module identities remain major `1` throughout pre-release;
2. physical workspace package versions may remain `0.0.0-dev` until publication;
3. exact executable identity comes from package and closure digests, not either version string.

This invariant is now enforced. Every project-owned production Module and Frontend identity uses
the literal major `1`, and the repository hygiene test parses production TypeScript so future code
cannot silently copy a physical package version into the logical protocol. Physical npm package
versions remain `0.0.0-dev` until there is an actual publication. Exact executable identity still
comes from the locked package bytes and closure digests.

## Execution order

1. keep public and engineering documentation factual and brand-neutral;
2. preserve the enforced logical `@1` identity invariant while packages remain unpublished;
3. settle the package rename map before npm publication work;
4. choose concrete Backlog packages from real delivery demand;
5. migrate a Seedance author Kit only with a real example that proves its semantic value.

This ledger changes when implementation evidence changes. A package moves to **Complete** only after
its author Surface, graph lowering and relevant execution/render evidence exist.
