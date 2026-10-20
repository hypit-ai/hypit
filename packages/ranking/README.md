# `@hypit/ranking`

Optional component, not installed with Hypit. Install in the video project:

```bash
npm install @hypit/ranking
```

The Track Surface accepts one completed Timeline plus absolute Windows and Instants. Those values
may be authored directly or published by a domain projector upstream.

Ranking boards introduce an item, give its verdict, and retain its place while the next item is
discussed. The board consumes absolute timing, Frames, Styles, fonts, text and optional icons or sound.

| Form | Temporal behavior |
| --- | --- |
| `TierBoard` | Place icons into authored tiers. Each non-preset item has a reveal Window; its settled placement persists. |
| `Column` | Place labeled rows at explicit ranks. Each non-preset row has a reveal Window; preset rows are already settled. |
| `TopThree` | Stage up to three items from activation Instants and an explicit terminal Instant. |

The board's outer Window owns its lifetime. Item reveal Windows must fit within it and be disjoint
where the selected schedule requires succession. Ending a reveal does not remove its settled result.
`preset` supplies initial state and needs no reveal event.

## Bind the ranking to resolved time

This excerpt assumes the Script, Timeline, Canvas, Frame and Style have been declared:

```svml
<import as="ranking" from="@hypit/ranking@1"/>

<ranking:Column id="priorities" timeline={speech.timeline} within={vertical.bounds}
  frame={layout.ranking} during={ranking} style={ranking-style}>
  <ranking:ColumnItem rank="1" label="Winner" during={winner}/>
  <ranking:ColumnItem rank="2" preset="true" label="Already placed"/>
</ranking:Column>
```

An upstream Narrative projection can publish `ranking` and `winner` from the relevant Segment and
Selection. When the performance changes, those projected Windows follow. Style defines how reveal
and settling use the Window. TopThree instead accepts item `at` Instants and a terminal Instant.

Each board publishes `.schedule`, `.program` and `.visual`. Optional normalized `appear-sound` or
`move-sound` inputs add `.events` and `.audio` where that form supports them.
The event plan drives the audio from the same appearance and movement timing
as the visual animation. Include the wanted visual and audio
outputs as peers in Film. Labels can be literal or graph Text; Styles are typed SVS Recipes with
exact fonts. Use `hypit vocabulary @hypit/ranking --tag Column` (or another declared tag) for its
attributes, children, outputs and configured example.

## Read it as a temporal component example

The published package contains compiled code, preview material and this README. The maintained source
lives in the Hypit repository; these links show how the responsibilities connect without claiming the
installed tarball contains a second editable source tree:

| File | What to learn from it |
| --- | --- |
| [surface.ts](https://github.com/hypit-ai/hypit/blob/main/packages/ranking/src/surface.ts) | `rankingSurface` resolves the board's already declared Window and item Window or Instant references, together with its content, layout and Style inputs. |
| [fragment.ts](https://github.com/hypit-ai/hypit/blob/main/packages/ranking/src/fragment.ts) | `createRankingFragment` receives Timeline and wires typed content, time, layout and Style inputs into finite operations. |
| [schedule.ts](https://github.com/hypit-ai/hypit/blob/main/packages/ranking/src/schedule.ts) | Compute reveal, activation and settled spans from the projected times. |
| [component.ts](https://github.com/hypit-ai/hypit/blob/main/packages/ranking/src/component.ts) and [render.ts](https://github.com/hypit-ai/hypit/blob/main/packages/ranking/src/render.ts) | Build the ranking program and produce picture and optional sound from that schedule. |
| [manifest.ts](https://github.com/hypit-ai/hypit/blob/main/packages/ranking/src/manifest.ts) and [activation.ts](https://github.com/hypit-ai/hypit/blob/main/packages/ranking/src/activation.ts) | Publish Types, Producers, Surface vocabulary and package contributions. |
| [Ranking Companion](https://github.com/hypit-ai/hypit/blob/main/packages/ranking/src/studio.ts) | Read the same program, present persistent rows and activation lanes, and connect edits to actual Source inputs. |

A project component can use these relationships with its own behavior. External TypeScript uses
`@hypit/hypit/author`, `@hypit/hypit/producer`, `@hypit/hypit/refinement`,
`@hypit/hypit/markup`, `@hypit/temporal/markup` and the appropriate domain APIs. Copy the relevant idea into
the project's own package, with its own Module identity, instead of editing the installed Ranking.

The Companion uses published values and temporal lineage, so a visible row and its reveal handle can
represent different spans. Moving the authored semantic boundary changes the shared event and its
consumers; editing a Style changes its appearance. [Studio Companion](https://github.com/hypit-ai/hypit/blob/main/packages/studio-companion/README.md)
contains a minimal project Companion and the exact presentation/editing interface.
