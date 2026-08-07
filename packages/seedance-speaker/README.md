# `@narratage/seedance-speaker`

Official deterministic UGC talking-head author module for Seedance. It is currently an internal
private workspace unit, not a commitment to publish one npm package per Seedance author module.

The package consumes an inert project SVS Recipe, one explicitly imported PromptKitSpec, one Script
dialogue excerpt and explicit image/audio references. Its Surface binds them into a generic Prompt
Kit Invocation and compiles an inspectable ordered `PromptProgram` during author compilation. The
same Surface renders the low-level `@narratage/seedance` `SpeechProgram`; the Run Graph then reuses the
exact Seedance request and generation contracts. The official Kit source is
[`official-ugc-v1.svs`](./kits/official-ugc-v1.svs).

It owns no Provider, credentials, queue or HTTP behavior. KIE, Volcengine or another explicitly
bound Endpoint only receives the already compiled exact Seedance request.

The official `official-ugc-v1` Kit contains a fixed base, reference contract, script contract,
texture and visible-text exclusion plus six configurable axes: composition stability, camera
motion, edit rhythm, performance, gesture and voice mapping. Project SVS selects values. The
official Kit SVS declares defaults, block order, value-to-Prompt choices and finite conditions. SVS
itself executes neither conditions nor concatenation; the generic Prompt Kit compiler does that.

## Compilation boundary

```text
Script dialogue + authored Blob references + SVS Recipe + PromptKitSpec
                         │
                         │ Speaker Surface: pure author-time lowering
                         ▼
          ordered PromptProgram + Seedance SpeechProgram
                         │ existing Runtime-graph model compiler
                         ▼
              exact Seedance generation Need
```

`take.prompt` and `take.program` are authored compile artifacts; `take.video` is the ordinary
Logical Output. The Prompt Program retains every ordered block and its origin; flattening is exactly
`blocks.map(block => block.text).join("\n\n")`. No Prompt assembly Operation appears in a BuildPlan.

The author imports this logical module and imports the selected Kit as an ordinary Source Module.
The Host package lock activates `@narratage/prompt-kit` and low-level `@narratage/seedance` independently. A
future public distribution may offer an optional install bundle, but the current repository keeps
their activations separate.

## `official-ugc-v1`

Defaults:

| Setting | Default | Choices |
|---|---|---|
| model | `seedance-2-mini` | `mini`, `fast`, `standard` |
| resolution | `720p` | `480p`, `720p`; `1080p` only for standard |
| aspect ratio | `9:16` | Seedance-supported aspect ratios |
| web search | `false` | `true`, `false` |
| composition stability | `soft-locked` | `flexible-ugc`, `soft-locked`, `strict-locked` |
| camera motion | `none` | `none`, `subtle-punch-in-return` |
| edit rhythm | `continuous-take` | `continuous-take`, `pause-trim-jump-cuts` |
| performance | `natural-explainer` | `natural-explainer`, `high-energy-ugc`, `calm-authority`, `reactive-playful` |
| gesture | `natural` | `restrained`, `compact`, `natural`, `expressive` |
| voice mode | `single-speaker` | `single-speaker`, `role-tagged-lines` |

The fixed base requests realistic phone-shot UGC, exact ordered dialogue and visible-speaker
lip-sync, coherent reference identity, photoreal texture and no generated readable text. It always
requests generated audio. One to nine image references are required; zero to three audio references
are allowed. With an audio reference, `@audio1` supplies the visible speaker's voice timbre.

`action` and `extra` are optional escape hatches appended as separate attributable blocks. They do
not alter Kit control flow.
