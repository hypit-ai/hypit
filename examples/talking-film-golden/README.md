# Talking-film authoring golden fixture

Status: **v2 authoring target, not executable end to end yet.** Script, Film, generic SVS and the
explicit HyperFrames Render Surface are implemented. The intervening generation, Speech and Track
components are the concrete package-local work remaining.

This example replaces neither the executable v1 fixtures nor their regression value. In particular,
`examples/flat-track-launch` remains the capability oracle for selections, moments, B-roll motion,
caption styling, sound and absolute stacking. This directory answers a different question:

> What should a normal author write after the v2 package architecture is hidden behind good
> namespaced Surfaces?

## What the source says—and does not say

The source explicitly chooses:

- two Seedance **Mini** speech generations, each with its own Script Segment, Prompt and reference;
- one Seedance Mini B-roll generation;
- one WhisperX measurement path;
- the Gemini-backed official Caption package;
- Hyperframes as the final rendering method.

It does not contain API keys, endpoint URLs, queue names, database names or deployment topology.
Those facts belong to a Runtime Profile. Runtime may bind `seedance.mini.*` to KIE, Volcengine or
Hypit, but it may not reinterpret Seedance as Kling or silently replace Gemini cue planning with a
different model family.

Prompt declarations, media declarations and `.svs` recipes appear before their uses. The Script
remains prose-first and contains no generation, styling or Track configuration.

The outer namespaced `.svml` tags do not each require a custom parser. `@svml/text` reads them with
one generic structured parser and validates them against the imported package Manifest; the owning
package supplies its schema and lowerer. Only the prose-first Script body needs the imported raw
Script Surface, while the CSS-like `.svs` source deliberately uses the separate `@svml/svs`
Frontend named by `using`.

## Author data flow

```text
Script ────────────────────────────────────────────────┐
  ├─ Segment + Prompt + reference -> Seedance Speech ─┤
  ├─ Segment + Prompt + reference -> Seedance Speech ─┤
  │                                                    ▼
  │                                              Speech Spine
  │                                         ┌──────────┴──────────┐
  │                                         │                     │
  │                                  audio basis          visual/audio Tracks
  │                                         │
  ├──────────────────────────────> WhisperX + speech-align
  │                                         │
  │                                  CompleteSemanticMap
  │                                  ┌───────┴────────┐
  │                                  │                │
  │                             Caption Track     B-roll Track
  │
  └─ caption display projection

Seedance B-roll + Text Track + every Track above
                         -> Film Composition
                         -> explicit Hyperframes compile + render component
                         -> final video Need
```

This is not a stored global workflow graph. The imported author packages lower these declarations
into a finite Graph Fragment for this source unit. Core sees only typed Logical Outputs, selected
Candidates and Operations.

## Lowering ledger

| Author syntax | Owning package | Lowered meaning | Repository state |
|---|---|---|---|
| `<script>` | `@svml/script` | authored `Narrative` and projections | implemented |
| `media:Image` | `@svml/media` | content-addressed authored Artifact | package/Surface missing |
| `seedance:Prompt` | `@svml/seedance` | package-private immutable direction value | missing |
| `seedance:Speech model="mini"` | `@svml/seedance` | explicit Seedance Mini Need returning one speech clip Product | missing |
| `speech:Spine` | `@svml/speech` | ordered clips -> one `SpeechBasis`, then ordinary projections | basis/projections implemented; author assembly missing |
| `whisperx:Alignment` | `@svml/whisperx` | request -> normalize -> provider-neutral `@svml/speech-align` -> Map | Graph Fragment implemented; Surface/endpoint missing |
| `seedance:Video model="mini"` | `@svml/seedance` | explicit Seedance Mini video Need | missing |
| `broll:Track` | `@svml/broll` | semantic windows + media + recipe -> peer Visual/Audio Tracks | Program/lowering implemented; Surface missing |
| `caption:Track` | `@svml/caption-gemini` | timed projection + Gemini cue grouping + role recipe -> VisualTrack | base timing/lowering implemented; Gemini/role Surface missing |
| `text:Track` | `@svml/text-track` | package Program -> VisualTrack | Program/lowering implemented; Surface/exact-font use missing |
| `film:Film` | `@svml/film` | finite TrackSet fold -> Composition | Graph Fragment and official Surface implemented |
| `render:Video` | `@svml/hyperframes-render` | Composition -> HyperframesDocument -> explicit render Need -> final video Artifact + Receipt | Surface, Fragment, Need and Product projection implemented; real Providers missing |
| `studio.svs` | `@svml/svs` | generic immutable Recipe Records; consuming packages must validate and lower them | parser and recursive source import implemented; video recipe consumers/exact font lowering missing |

The missing work is intentionally package-local. None of these rows requires a new Core video type,
a component-family registry in Core, a privileged Film root or another Track kind.

## Expected Provider bindings

A local developer profile could bind the exact capabilities as follows:

```yaml
bindings:
  seedance.mini.speech-video@1: kie.seedance-mini
  seedance.mini.video@1: kie.seedance-mini
  whisperx.alignment-evidence@1: whisperx.local
  google.gemini.structured-generation@1: gemini.api
  hyperframes.render@1: hyperframes.local
```

A Hypit profile changes endpoint bindings, not `main.svml`. Existing Values, black frames and other
preview realizations remain explicitly selected Candidates in a BuildRequest; they do not alter
the author source or teach Runtime to guess a creative method.

The intended final command is:

```bash
svml build main.svml --target final.video
```

Before the remaining Surfaces and Providers are implemented, tools must report that the complete
file is a design fixture rather than pretending to compile it with the v1 engine.
