# `@hypit/local-notepad-list`

A project-local author package for one self-contained full-screen graphic composition: a numbered
list written by hand onto a sheet of paper, one row at a time, that leaves and comes back as the
programme returns to it.

It exists because no installed package owns that picture. `@hypit/ranking` owns three progressive
boards — `Column`, `TierBoard` and `TopThree` — and all three draw a rounded, bordered, shadowed
panel with coloured slats or rings, fill from the top down inside one Selection occurrence, and own
no background material of their own. `@hypit/typography-track`, `@hypit/media-track`,
`@hypit/deck-track` and `@hypit/screen-overlay` each own one part of the picture and none of them
owns the whole field, which would scatter one visual system across unrelated tags. The composition
here owns its paper, its title, its slots, its reveal and its annotation together.

```svml
<import as="notes" from="@hypit/local-notepad-list@1"/>

<notes:ListStyle id="notepad" recipe={studio.notepad.list}
  title-font={title-face} emphasis-font={emphasis-face} row-font={hand-face}/>

<notes:List id="board" map={timing.map} space={speech.space} frame={full}
  surface={paper.image} during={story.selection.board} opening={story.selection.opening}
  triggers={story.moment.write} terminal={story.moment.settled}
  title="Top 5 Most Popular Ways to " title-emphasis="learn AI" style={notepad}>
  <notes:Row id="row-instagram" rank="5" label="Instagram"/>
  <notes:Row id="row-courses"   rank="4" label="AI Courses"/>
  <notes:Row id="row-youtube"   rank="3" label="YouTube"/>
  <notes:Row id="row-twitter"   rank="2" label="Twitter/X"/>
  <notes:Row id="row-rundown"   rank="1" label="The Rundown" mark="circle"/>
</notes:List>
```

## What it draws

The paper is a picture the package consumes on the `surface` edge; it never generates or embeds one.
Everything else is computed: the title is one wrapping block set in two faces, the rank numbers are
all written from the first frame the sheet appears, and each row's copy is revealed grapheme by
grapheme at its own trigger. `rank` decides where a row sits down the sheet and document order
decides when it is written, so a list can fill from the bottom upward. A row written `mark="circle"`
gains a tilted ellipse that draws itself around the number and copy once that copy has finished.

`during` is read for **every** occurrence of its Selection, because the sheet is one system that
leaves and returns while keeping its state. `opening` is the one window before the paper ever
appears, where the title alone writes itself over whatever is already on screen, in the Recipe's
`opening-*` paint instead of its `title-*` paint.

## Outputs

| Port | Type |
|---|---|
| `schedule` | `NotepadSchedule` — every window, the opening, each row's trigger frame and the terminal frame |
| `program` | `NotepadProgram` — Frame, paper, Style, Schedule, title and ordered rows |
| `visual` | `@hypit/composition@1#VisualTrack` |

There is no audio port: the reference this package was built from carries no sound of its own, so a
sound branch would have nothing to play.

## Preview

`preview/List.png` is rendered by `test/render-still.ts`, which builds the Track and renders it
through the local HyperFrames Runtime:

```bash
node --import tsx examples/ranking-typewriter-reverse/packages/local-notepad-list/test/render-still.ts \
  <paper.png> w5 40 preview/List.png
```

The recipe values that script uses live beside it in `test/notepad-recipe.json` so the preview and
the project's `studio.svs` can be kept in step.
