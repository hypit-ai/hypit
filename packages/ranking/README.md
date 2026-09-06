# `@hypit/ranking`

Ranking boards that follow the argument of a video: introduce an item, give its verdict, and retain
its place while the next item is discussed. The board consumes the performance's SemanticTrack,
Frames, Styles, fonts, text and optional icons or sound.

| Form | Temporal behavior |
| --- | --- |
| `TierBoard` | Place icons into authored tiers. Each non-preset item has a reveal Window; its settled placement persists. |
| `Column` | Place labeled rows at explicit ranks. Each non-preset row has a reveal Window; preset rows are already settled. |
| `TopThree` | Stage up to three items from activation Instants and an explicit terminal Instant. |

The board's outer Window owns its lifetime. Item reveal Windows must fit within it and be disjoint
where the selected schedule requires succession. Ending a reveal does not remove its settled result.
`preset` supplies initial state and needs no reveal event.

## Bind the ranking to the target Script

This excerpt assumes the Script, SemanticTrack, Canvas, Frame and Style have been declared:

```svml
<import as="ranking" from="@hypit/ranking@1"/>

<ranking:Column id="priorities" semantic={speech.semantic} canvas={vertical}
  frame={layout.ranking} during={story.segment.ranking} style={ranking-style}>
  <ranking:ColumnItem rank="1" label="Winner" during={story.selection.winner}/>
  <ranking:ColumnItem rank="2" preset="true" label="Already placed"/>
</ranking:Column>
```

Choose `winner` to cover the phrase whose delivery stages this reveal. When that performance changes
length, the projected Window follows the phrase. Style defines how the reveal and settling use that
Window. TopThree instead accepts item `at` projections and a board `terminal` projection; a Moment
can supply the intended trigger.

Each board publishes `.schedule`, `.program` and `.visual`. Optional normalized `appear-sound` or
`move-sound` inputs add `.audio` where that form supports them. Include the wanted visual and audio
outputs as peers in Film. Labels can be literal or graph Text; Styles are typed SVS Recipes with
exact fonts. Use `hypit vocabulary @hypit/ranking --tag Column` (or another declared tag) for its
attributes, children, outputs and configured example.

## Read it as a semantic component example

The following files are included in the Distribution and show how the responsibilities connect:

| File | What to learn from it |
| --- | --- |
| [surface.ts](src/surface.ts) | `rankingSurface` resolves author inputs, projects the outer and item times through `createTemporalWindowProjection` / `createTemporalInstantProjection`, and retains the returned drafts and references. |
| [fragment.ts](src/fragment.ts) | `createRankingFragment` projects ProgramSpace and wires typed content, time, layout and Style inputs into finite operations. |
| [schedule.ts](src/schedule.ts) | Compute reveal, activation and settled spans from the projected times. |
| [component.ts](src/component.ts) and [render.ts](src/render.ts) | Build the ranking program and produce picture and optional sound from that schedule. |
| [manifest.ts](src/manifest.ts) and [activation.ts](src/activation.ts) | Publish Types, Producers, Surface vocabulary and package contributions. |
| [Ranking Companion](../ranking-studio/src/index.ts) | Read the same program, present persistent rows and activation lanes, and connect edits to actual Source inputs. |

A project component can use these relationships with its own behavior. External TypeScript uses
`hypit/author-kit`, `hypit/temporal-markup` and the appropriate `hypit/*` domain APIs; the official
implementation's `@hypit/*` imports are internal workspace spellings. Copy the relevant idea into
the project's own package, with its own Module identity, instead of editing the installed Ranking.

The Companion uses published values and temporal lineage, so a visible row and its reveal handle can
represent different spans. Moving the authored semantic boundary changes the shared event and its
consumers; editing a Style changes its appearance. [Studio Adapter](../studio-adapter/README.md)
contains a minimal project Companion and the exact presentation/editing interface.
