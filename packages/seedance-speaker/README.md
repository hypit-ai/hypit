# `@narratage/seedance-speaker`

Official deterministic UGC talking-head author module for Seedance. It is currently an internal
private workspace unit, not a commitment to publish one npm package per Seedance author module.

The package consumes an inert project SVS Recipe, one explicitly imported `TextTemplate`, one Script
dialogue `Text` and explicit image/audio references. Its Surface connects that authored `Text`
directly to a visible `@narratage/text` render component in the graph. Optional per-Take `action`
and `extra` values are also ordinary Text edges; they are not
hidden Recipe strings. The rendered `Text` output is wired to Seedance's exact `prompt` port. The
same Surface authors the low-level
`@narratage/seedance` `DurationProgram`; generation reuses the exact Seedance ReferenceVideo request shape. The
official Text Template source is
[`official-ugc-v1.svs`](./kits/official-ugc-v1.svs).

It owns no Provider, credentials, queue or HTTP behavior. KIE, Volcengine or another explicitly
bound Endpoint only receives the already compiled exact Seedance request.

The official `official-ugc-v1` template contains a fixed base, reference contract, script contract,
texture and visible-text exclusion plus six configurable axes: composition stability, camera
motion, edit rhythm, performance, gesture and voice mapping. Project SVS selects values. The
official SVS declares defaults, block order, value-to-text choices and finite conditions. SVS
itself executes neither conditions nor concatenation; the domain-neutral Text component does that.

## Compilation boundary

```text
Script dialogue Text ──────────────────────────┐
optional action/extra Text ────────────────────┼──► render Text
SVS-selected TextBindings + TextTemplate ──────┘         │
                                                        │ exact prompt edge
authored Blob references + Seedance DurationProgram ────┼──► generation Need
```

`take.prompt` and `take.video` are ordinary Logical Outputs; `take.program` is authored configuration.
Prompt assembly is the deterministic `@narratage/text#render` Operation in the BuildPlan, so the text
can be targeted or satisfied by another compatible Candidate without a Seedance-specific rule.

The author imports this logical module and imports the selected template as an ordinary Source Module.
The Host package lock activates `@narratage/text` and low-level `@narratage/seedance` independently. A
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

`action` and `extra` are optional per-Take Text inputs appended as separate attributable blocks.
They do not alter Kit control flow. Recipe files select method and style axes only; putting content
in `recipe.action` or `recipe.extra` is rejected so content dependencies cannot disappear into
Frontend lowering.
