# Twinit capability migration ledger

Status: current migration inventory, 2026-08-10. This document is an execution ledger, not a
compatibility promise. Twinit's active production canvas is the audit source; Narratage keeps old
outcomes only when they fit the current graph, peer-Track and explicit-provider laws.

## Status vocabulary

- **Complete:** a current author package or graph composition provides the production outcome.
- **Expressible; Template missing:** current model/graph contracts can express the request, but a
  reusable author Text Template has not been migrated.
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
| `text_concat` | Complete | `@narratage/text` provides deterministic sequence/join expressions and an ordinary graph `Text` output. |
| `text_replace` | Deliberately omitted | The old pronunciation-rewrite workflow is superseded by Script Dual Text. Generic Text templates may still perform an explicitly authored substitution for unrelated work, but no speech path rewrites the author's text. |
| `seedance_avatar` | Complete | The official Seedance Speaker path covers the single-speaker reference-image/audio case. |
| `seedance_speaker` | Complete | `@narratage/seedance-speaker` with one explicit six-axis Text Template, SVS settings and visible Text render edge. |
| `seedance_broll` | Complete | `@narratage/seedance-kits/broll` is a six-axis silent micro-story Text Template; its output and every image reference enter generic `seedance:ReferenceVideo` through explicit edges. |
| `seedance_podcast` | Complete | `@narratage/seedance-kits/podcast` preserves the two-view/two-voice stage contract as data; generic Text and Seedance Surfaces own execution. |
| `seedance_call` | Complete | `@narratage/seedance-kits/call` preserves live main-tile/PiP reverse views without adding a call mode to the model package. |
| `seedance_street_interview` | Complete | `@narratage/seedance-kits/street-interview` owns role, voice, microphone-handoff and shared-scene semantics as a Text Template. |
| `seedance_keyframe` | Complete | Generic `seedance:FrameVideo` exposes explicit first-frame and optional last-frame ports; author Text remains a separate graph input. |
| `seedance_reference` | Complete | `seedance:TextVideo`, `seedance:FrameVideo` and `seedance:ReferenceVideo` expose the three exact model request shapes without prompt assembly in the model package. |
| `seedance_motion_ref` | Complete | `@narratage/seedance-kits/motion-reference` states the motion-only transfer; subject image and reference video remain ordinary media edges. |
| `seedance_camera_ref` | Complete | `@narratage/seedance-kits/camera-reference` states the camera-only transfer over the same generic media topology. |
| `concat` | Complete | Ordered Media/Speech graph composition replaces clip concatenation as a special node. |
| `base_track` | Complete | Speech Spine, Media Track and Film replace the privileged base lane. |
| `video_enhance` | Deliberately omitted | Explicitly outside this migration. A future video-in/video-out package can be added without reserving a Core or media-pipeline mode. |
| `broll_track` | Complete | Unified `@narratage/media-track` Item/Sequence authoring; the old B-roll package is retired. |
| `deck_track` | Complete | `@narratage/deck-track` implements the independent DepthStack collection model. |
| `cluely_ui_track` | Deliberately omitted | Product-specific UI recreation was explicitly removed from the migration scope. |
| `comment_sticker_track` | Complete | Independent `@narratage/comment-sticker` Style/Track Surfaces lower explicit content, Spatial Frames and shared Temporal projections to a self-contained peer Visual Track. |
| `text_track` | Complete | `@narratage/typography-track` implements Point/Area/Path text, rich paint, boxes, layout, masks and motion. |
| `subtitle_track` | Complete | Caption Plan, Gemini planner and `@narratage/caption-fine` replace the monolithic subtitle node. |
| `fx_track` | Deliberately omitted | Base/lower-composite sampling violates peer self-contained Track laws; no placeholder is reserved. |
| `audio_track` | Complete | `@narratage/audio-track` provides exact sample-domain placement, playback, fades and mixing inputs. |
| `screen_fx_track` | Complete | `@narratage/screen-overlay` provides self-contained full-canvas peer Tracks without reading lower pixels. |
| `ranking_track` | Complete | `@narratage/ranking` exposes TierBoard, Column, TopThree and TypewriterList as separate components. |
| `locate` | Complete | WhisperX evidence, Speech Alignment, SemanticMap, Temporal, Spatial and Film replace one privileged locate phase. |
| `export` | Complete | Composition, HyperFrames document compilation, visual rendering, audio rendering and mux are explicit graph operations. |

Totals: **30 Complete**, **0 Expressible; Template missing**, **0 Backlog**, **5 Deliberately omitted**.

## Prompt and Text audit

The migration decision is based on Twinit's current Seedance executors, the maintained operator node
manuals and the production graph-patch evidence that introduced and tuned the prompt axes. The old
node names are evidence, not an API to reproduce.

### Boundary retained in Narratage

- `@narratage/text` owns only finite data-only templates, bindings and ordinary `Text` values. It has
  no model, media, Provider, queue, credential, network or cache authority.
- `text:Render` may project only the scalar Recipe properties actually declared by its template;
  explicit `Param` children override them. This is the reusable style → recipe → parameter bridge,
  not Seedance-specific code. Every text value
  produced elsewhere remains an explicit graph input; it cannot be copied into hidden Frontend
  state.
- The Seedance Speaker path now records
  `Script dialogue Text -> TextTemplate -> Seedance prompt` as real Operations and edges.
  Optional action and extra direction are Text inputs, not magic strings embedded in the Recipe.
- Exact model packages declare text ports. Provider packages only translate a finalized exact model
  request to one service API. Neither layer assembles creative prompts.
- Ordinary Text also feeds visible consumers through graph edges: Typography content, Ranking
  labels/title/rows, Comment Sticker copy and Deck labels. Consumer-specific style, timing and
  layout never move into `@narratage/text`.

### Twinit Seedance judgement

| Old surface | Decision | Reason |
|---|---|---|
| `seedance_avatar` | Retire the named duplicate | Its useful single-speaker outcome is covered by Speaker. Its hard-coded gender, seven always-on craft paragraphs and conflicting locked-shot/jump-cut advice are old policy, not model capability. |
| `seedance_speaker` | Keep and refine | Reference preservation, dialogue/voice mapping and the six axes are useful author semantics. They belong in an imported Text Template plus a thin role-aware author Surface. |
| `seedance_broll` | Keep as a data-only author Kit | Silent visual support is a real semantic contract. Its six prompt axes remain editable template data. |
| `seedance_podcast` | Keep as a distinct data-only Kit | Two co-present views, two voices and A/B dialogue are a genuine stage contract, not a runtime mode guess. |
| `seedance_call` | Keep as a distinct data-only Kit | Main-tile/PiP geometry and live listener behavior differ materially from a co-present podcast. It is not a hidden `mode`. |
| `seedance_street_interview` | Keep as a distinct data-only Kit | Interviewer/guest roles and microphone handoff are real authored staging semantics. |
| `seedance_reference` | Do not recreate as a prompt Kit | It was the low-level escape hatch with no prompt scaffold. Generic exact Seedance plus ordinary Text and media edges already is that abstraction. |
| `seedance_keyframe` | Keep low-level | First/last frame and motion Text are exact model ports; a dedicated named author Surface is optional convenience, not missing semantics. |
| `seedance_motion_ref` / `seedance_camera_ref` | Preserve as two small templates | “Copy body motion” and “copy camera path” are genuinely different reference interpretations. They need small explicit templates, not new Provider logic or duplicated model executors. |

The old `tight_cuts`, `varied_emphasis` and `skeptical_reacts` aliases that emitted identical text are
not migrated. Silent resolution clamps, parameters displayed but ignored by execution, inline
`data.prompt` fallbacks and `prompt + extra_prompt` concatenation inside a model executor are also
rejected. The graph must show the selected Text and every dynamic contribution before a request is
finalized.

Twinit also contains an opt-in GPT Image prefix/suffix repairer. It is not GPT Image capability: it
is one historical real-shot style template. If retained for a project, it belongs in an ordinary
Text Template and must remain visible before the exact GPT Image prompt edge. It does not justify
model-specific prompt code in `@narratage/gpt-image`.

### VLM work is deferred beyond this version

Twinit's temporal intent VLM and spatial query paths are acknowledged but intentionally not being
migrated in the current version. They are inference components, not missing branches of Locate:

```text
Video + Text intent -> temporal selection/evidence
Video + Text intent -> spatial selection/evidence
```

If real delivery demand brings them back, each path must be a separately imported author/model
package with explicit inputs, an exact model capability and explicit graph outputs. Neither may
read hidden context, mutate a SemanticMap, become a Runtime guess or add VLM meaning to Core.

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

## Package naming resolution

The physical package taxonomy is mostly regular: `provider-*`, `artifact-store-*`,
`credential-store-*`, `transport-*`, `*-track`, `*-local`, `*-aws-lambda` and `*-node` communicate
their roles. The former overloaded `text` name has been resolved atomically:

| Current name | Exact role |
|---|---|
| `@narratage/markup` | Official XML-like authoring Frontend; it owns syntax, not text values. |
| `@narratage/run-markup` | Official XML-like Run Frontend, named by the syntax it reads. |
| `@narratage/compiler-markup-node` | Node compiler assembly selecting the Markup Frontend. |
| `@narratage/typography-track` | Video typography; separate from both Markup syntax and domain-neutral Text values. |
| `@narratage/text` | Domain-neutral, graph-native text programs and rendered Text values. |
| `@narratage/local` | It is a Node local Runtime/developer distribution, not a generic notion of locality. |
| `@narratage/hyperframes` / `render-hyperframes` | One compiles terminal Visual IR; the other is the author-visible render graph package. |
| `@narratage/media-pipeline` / `media-execution` | One owns provider-neutral contracts and plans; the other is the shared FFmpeg execution body. |

The remaining `local`, HyperFrames and media naming questions are independent publication choices;
they no longer overload one word across syntax, graph text and video typography.

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
4. exercise the completed Seedance templates in real delivery graphs without adding model wrappers;
5. keep VLM temporal/spatial interpretation outside the current version.

This ledger changes when implementation evidence changes. A capability moves to **Complete** only
after its author data/Surface, graph lowering and relevant execution evidence exist.
