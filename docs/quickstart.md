---
title: Quickstart
description: Check and compile your first SVML video in minutes.
---

# Quickstart

Start with a spoken script and compile it into a video page ready for HyperFrames to render.

## Install

SVML currently requires Node.js 22 and pnpm.

```bash
pnpm install
pnpm build
```

## Start with a real example

The Ranking example in this repository uses `@name … @/name` to declare semantic ranges in the spoken script, then lets components consume those ranges. Here is the core excerpt:

```xml
<svml version="1">
  <import from="../../stdlib/ranking-column.svk"/>

  <script>
    <segment id="ranking">
      <NARRATOR> @photoshop Photoshop.
      <SPEAKER> Powerful, but only if you know how to use it.
                Otherwise it becomes a three-hour project @/photoshop.
    </segment>
  </script>

  <ranking-column id="ranking" z="42">
    <item
      id="photoshop"
      rank="5"
      image={ranking-icon-5}
      during={script.selection.photoshop}
    />
  </ranking-column>
</svml>
```

There is no hand-written “second 3 to second 7.” The locator resolves the `photoshop` Selection against the spoken script and media into the real time range for this build.

## Check and compile

```bash
pnpm svml check examples/regen-ranking/regen-ranking.svml
pnpm svml lock examples/regen-ranking/regen-ranking.svml --out svml.lock
pnpm svml compile examples/regen-ranking/regen-ranking.svml \
  --lock svml.lock \
  --out build/index.html
```

`check` verifies that the declarations are complete; `lock` freezes the inputs actually used by this build; `compile` produces deterministic HyperFrames HTML.

## Render

```bash
pnpm svml render build/index.html --out build/video.mp4
```

::: warning Current status
The executable example requires its local media and alignment evidence. Automatic loading from online Providers is not implemented yet.
:::

Continue to [Components](/guide/components) to learn how recurring visual treatments can be packaged as SVK components.
