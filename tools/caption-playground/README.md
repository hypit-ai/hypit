# Caption Playground

A filesystem-backed editor for one real Fine Caption Style. It is deliberately
not a generic component inspector.

```bash
pnpm caption:playground -- \
  --source examples/talking-film-graph-check/main.svml \
  --package-lock examples/talking-film-graph-check/svml.packages.lock \
  --style base-caption \
  --display story.caption \
  --recipe examples/talking-film-graph-check/studio.svs#caption.base \
  --font examples/talking-film-graph-check/main.svml#caption-font \
  --canvas 1080x1920 \
  --fps 30
```

Every semantic input is selected at startup. There is no central package list,
component registry, preview default or private Playground document.

The author Source, SVS and font-source files may live outside this repository. Installed packages
resolve from this tool's own installation by default; pass `--package-root <directory>` only when
the lock names packages installed somewhere else. Source containment and package resolution remain
separate boundaries, just as they are in the CLI.

## Source of truth

- Recipe controls write the named properties in the selected `.svs` Recipe.
- Font controls write `family`, `weight` and `style` on the selected
  `<fonts:Stack>` in the `.svml` source.
- Script and other external edits are watched and recompiled.
- Each browser write carries the digest it read. If an editor or Agent changed
  the file first, the stale browser write is rejected and the newest source is
  shown.

Writes are atomic. The browser keeps only the playhead, search text and open UI
sections in memory.

## What is real and what is preview-only

The Node side loads the selected package lock and runs the ordinary author
compiler. The browser receives the real `CaptionStyleIntent`,
`CaptionDisplaySequence` and exact font attachments, then calls the real Fine
Caption renderer and Hyperframes document compiler.

The only synthetic fact is a local showcase timeline used to scrub karaoke and
motion before WhisperX evidence exists. It never becomes a Record, SemanticMap,
BuildState or source file. It therefore cannot claim estimated timing in the
author or run graph.

The font gallery is the catalog already owned by `@narratage/fonts-open`; font
cards lazy-load and render their own pinned font bytes. Selecting a card still
changes the real `fonts:Stack`, so the next frame is compiled from the same font
Artifact path as a Build.
