# `@hypit/local-linerank`

A project-local author component that draws a full-screen lined/grid-paper ranking board whose
labels type in one character at a time and which can finish with a hand-drawn circle around the top
item. It owns the whole composition — the paper surface, the ruled grid, the title, the numbered
rows, the typewriter reveal and the closing circle — as one self-contained `VisualTrack`.

It exists because no installed package expresses the reference's notebook-paper ranking list
(the `@hypit/ranking` variants draw rounded boards with icon tiles, not paper with typed labels).

## Surfaces

- `linerank:BoardStyle` — compiles one SVS Recipe and one exact font into the board's Style.
  The Recipe accepts exactly the keys the package lists; every other key is refused by name.
- `linerank:Board` — the board itself. It takes `map`, `space`, `frame`, a `during` Selection
  (every occurrence is one board window), a `triggers` Moment (one occurrence per Item, in document
  order), a `terminal` Moment, a `style`, a `title` expression, and one `BoardItem` child per item.

```svml
<import as="linerank" from="@hypit/local-linerank@1"/>

<fonts:Stack id="board-font" family="shadows-into-light" weight="400" style="normal"/>
<linerank:BoardStyle id="paper-style" recipe={studio.linerank.board} font={board-font}/>
<linerank:Board id="board" map={timing.map} space={speech.space} frame={board-frame}
  during={story.selection.board} triggers={story.moment.reveal} terminal={story.moment.done}
  style={paper-style} title="Top 5 Most Popular Ways to learn AI">
  <linerank:BoardItem id="item-5" rank="5" label="Instagram"/>
  <linerank:BoardItem id="item-1" rank="1" label="The Rundown"/>
</linerank:Board>
```

The board reveals Items in document order; each label types into the row named by its `rank`
(1 is the top row). Every label already revealed stays in later windows. The `terminal` Moment draws
the hand-drawn circle around the top row.

## Timing model

- `during` may be a non-contiguous Selection; the number of occurrences must equal the number of
  Items, and each occurrence becomes one board window.
- Each Item's `trigger` Moment must fall inside its own window.
- The typewriter reveal animates a `clip-path` inset over `label-length × type-frames-per-char`
  frames, so the label reads in left-to-right one character at a time.
- The circle scales in with a wobbly border-radius over `circle-frames` starting at the terminal
  Moment.

## Package layout

```
src/manifest.ts   module identity, nominal Types, Producers, Surface vocabulary
src/types.ts      TypeScript shapes
src/schedule.ts   assert/seal functions and the schedule builder
src/style.ts      SVS Recipe decoder
src/render.ts     Program → VisualTrack renderer
src/surface.ts    markup decoders
src/fragment.ts   graph fragment wiring
src/component.ts  producer handlers and validators
src/activation.ts activation contribution
preview/Board.png preview image for the Board Surface
```
