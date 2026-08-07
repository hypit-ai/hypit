---
title: Create SVK Components
description: Package recurring video treatments as reusable components.
---

# Create SVK Components

SVK is the reusable component format for SVML. Authors describe what they want; the component decides how to produce it.

## A minimal component

Suppose we want to package a ranking card. The author only needs to write:

```xml
<script>
  <segment id="ranking">
    <HOST>Here is @winner our number one pick @/winner.
  </segment>
</script>

<ranking-card
  title="Top 5 tools"
  during={script.selection.winner}
/>
```

The component owns its typography, layout, entrance behavior, and output Track. Video authors do not need to rebuild the node graph or tune a dozen parameters every time.

## What a component should hide

- Repeated internal wiring and defaults
- Visual styling, animation, and media placement
- The concrete HyperFrames output implementation

## What a component should not hide

- Choices that materially change the author's intent
- Whether a transition is a hard cut, fade, or push
- Which part of the spoken script the card should bind to

Good components expose a small set of clear choices:

```xml
<ranking-card
  during={script.selection.winner}
  enter="fade 200ms"
  exit="push-left 300ms"
/>
```

## Next

Components that call video-generation APIs also ship with a Runtime implementation. Authors declare the content; the Runtime handles requests, queues, and downloads. See [Runtime & Providers](/guide/runtime).
