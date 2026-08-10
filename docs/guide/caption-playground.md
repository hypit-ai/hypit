---
title: Caption Playground
description: Edit a real Fine Caption SVS Recipe and exact font stack with live feedback.
---

# Caption Playground

Caption styling benefits from a visual editor, but the editor must not become a
second authoring system. Caption Playground reads and writes the same `.svml`
and `.svs` files that an ordinary Build compiles.

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

Open `http://localhost:5178`.

All selections are explicit:

| Argument | Selected fact |
|---|---|
| `--source` | self-described author source |
| `--package-lock` | trusted author compiler closure |
| `--style` | authored Fine Caption Style export |
| `--display` | authored Caption Display export |
| `--recipe` | real SVS file and Recipe path to edit |
| `--font` | real SVML file and `fonts:Stack` id to edit |
| `--canvas`, `--fps` | local preview context, not author semantics |

Recipe fields use author vocabulary: `size`, `padding`, `fill`, and so on. The
form never exposes compiled DTO names such as `fontSizePx` or
`paddingXPx`. Font family, weight and style have one source of truth: the
selected `<fonts:Stack>` in SVML, while the SVS Recipe owns size, placement,
paint, boxes, karaoke and motion.

The font gallery renders each choice in its own pinned redistributable font.
Clicking one atomically edits the selected stack and recompiles the source.
External editor or Agent changes use the same files and trigger the same
refresh. Stale browser writes are rejected by source digest instead of silently
overwriting newer work.

Caption Playground creates no component registry, preview package metadata,
private project file, hidden default Style or production-package dependency.
Its showcase Cue timing exists only in the browser so animation can be scrubbed;
it never enters the Graph or BuildState.
