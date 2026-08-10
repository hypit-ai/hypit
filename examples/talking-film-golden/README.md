# Talking-film authoring golden fixture

Status: **two-speaker production target, not executable end to end with the checked-in fixture.**
Every author Surface and the Gemini planning/Vertex execution package now exists. Real image/font
assets, credentials and a selected local Runtime profile are not checked into this fixture.

This directory answers one question:

> What should a normal author write once the package architecture is hidden behind good
> namespaced Surfaces?

## What the source says—and does not say

The source explicitly chooses:

- two Seedance **Mini** speech generations, each with its own Script Segment, Prompt and reference;
- one Seedance Mini media generation used editorially as B-roll;
- one WhisperX measurement path;
- the Gemini-backed official Caption package;
- Hyperframes as the final rendering method.

It does not contain API keys, endpoint URLs, queue names, database names or deployment topology.
Those facts belong to a Runtime Profile. Runtime may bind `seedance.mini.*` to KIE, Volcengine or
Hypit, but it may not reinterpret Seedance as Kling or silently replace Gemini cue planning with a
different model family.

Prompt declarations, media declarations and `.svs` recipes appear before their uses. The Script
remains prose-first and contains no generation, styling or Track configuration.

The outer namespaced `.svml` tags do not each require a custom parser. `@narratage/markup` reads them with
one generic structured parser and validates them against the imported package Manifest; the owning
package supplies its schema and lowerer. Only the prose-first Script body needs the imported raw
Script Surface, while the CSS-like `.svs` source deliberately uses the separate `@narratage/svs`
Frontend named by `using`.

## Author data flow

```text
Script dialogue + Prompt + reference ──> two Seedance Speech Needs
                                                   │
                                                   ▼
                                              Speech Spine
                                         ┌─────────┴─────────┐
                                         │                   │
                                  audio basis       visual/audio Tracks
                                         │
                                         ▼
                                  WhisperX + align ───────────┐
                                  CompleteSemanticMap         │
                                                              ▼
Script left display + Caption Program ──> Gemini Plan ──> Caption Track

Script selections + normalized generated media ─────────> Media Track

Media Track + Text Track + every Track above
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
| `<script>` | `@narratage/script` | authored `Narrative` and projections | implemented |
| `media:Image` | `@narratage/media` | content-addressed authored Artifact | implemented |
| `wording:Value` | `@narratage/text` | model-neutral immutable Text value | implemented |
| `seedance:Speech model="mini"` | `@narratage/seedance` | explicit Seedance Mini Need plus primary-video projection | implemented; explicit duration remains authored until Speech scheduling exists |
| `speech:Spine` | `@narratage/speech` | ordered clips -> normalized Takes, one `SpeechBasis`, then ordinary projections | Surface, fold, media normalization and projection components implemented |
| `whisperx:Alignment` | `@narratage/whisperx` | 48k speech master -> explicit 16k evidence Need -> WhisperX -> provider-neutral `@narratage/speech-alignment` -> Map | Surface, Graph Fragment, deterministic components and local Provider/service implemented |
| `seedance:Video model="mini"` | `@narratage/seedance` | explicit Seedance Mini video Need plus primary-video projection | implemented |
| `media-track:Track` | `@narratage/media-track` | semantic windows + normalized media + explicit Frame/Recipe -> peer Visual/optional Audio Tracks | Item/Sequence Surface and deterministic lowering implemented |
| `caption-fine:Style` / `caption:Program` | Fine + common Caption | explicit default over all words + ordered whole-Style replacement by Role or word subset | implemented |
| `caption-ai:Planner` | `@narratage/caption-gemini` | immutable display Atoms/Words + per-run requirements -> whole-Atom Cue cuts and optional per-Word fields | implemented; Google Vertex Endpoint implemented separately |
| `caption-fine:Track` | `@narratage/caption-fine` | CaptionPlan + independent SemanticMap + complete Fine Styles -> VisualTrack | implemented |
| `text:Track` | `@narratage/typography-track` | package Spec + ProgramSpace -> VisualTrack | provider-free Surface/lowering implemented; exact-font use remains |
| `film:Film` | `@narratage/film` | finite TrackSet fold -> Composition | Graph Fragment and official Surface implemented |
| `render:Video` | `@narratage/render-hyperframes` | Composition -> silent HyperframesDocument render + explicit program audio + mux -> final video Artifact + Receipt | Surface, Fragment and all local execution Providers implemented |
| `studio.svs` | `@narratage/svs` | generic immutable Recipe Records; consuming packages validate and lower them | parser, imports and current package consumers implemented; exact font assets remain |

The remaining work is intentionally package-local. None of these rows requires a new Core video type,
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

The intended final command uses the checked-in self-described Run Source:

```bash
narratage build build.svrun --runtime ./svml.runtime.json
```

Until real assets, credentials and a Runtime profile are supplied, tools must report this file as a
production design fixture rather than promise a rendered file. `../talking-film-graph-check` is the
fully checkable graph today.
