---
title: Component Design
description: Turn a scene's creative interface into a reusable project component.
---

A component connects an author-facing idea to its implementation. For a ranking board, that idea
might be “introduce each contender on its line, then move its icon into the ranked position.” Its
inputs express those relationships; its code supplies the drawing and motion.

Start with [Adding an Author Package](./author-packages.md) for a complete buildable example.
[Ranking](https://github.com/hypit-ai/hypit/blob/main/packages/ranking/README.md) is a richer example
of semantic events and persistent state.

## Start from the author-facing behavior

Name the component by the visual or audible role it contributes. Its Source interface should expose
content, placement, appearance and meaningful events that another author may intentionally change.
Keep scheduling and drawing together when they express one behavior; split files when that makes the
package easier to understand. The included package README owns the exact TypeScript file layout and APIs.

## Design around relationships

For spoken work, source-local transcript selections and word times can inform materialization. The
accepted component instance receives direct placement and package parameters; it does not query a
global Timeline during preview or export. Package-owned Item-local controls may still express exact
internal animation time.

Media presentation, spatial layout and time remain separate relationships. The NLE Item owns its
programme placement and trim; its source owns local media time; an explicit mapping connects them
during AVIR lowering. The picture layout locates the instance, while its internal HTML/CSS or element
tree coordinates videos, text, masks and graphics. Group content that shares behavior. Independent
contributions remain separate Items with explicit paint order.

A caption family can consume a caption document and source-local timing when it materializes cues.
Each resulting Component Item then owns package parameters for its text and treatment. A new family
can materialize the same evidence into a different visual behavior without adding an NLE primitive.

## Make it useful to another author

Choose parameter names from the creative decision: the reveal event, the content, the placement,
the appearance. Document defaults and what an override changes. A Style decoder receives an SVS
Recipe shaped as `{ path, properties }` and explicit font resources; a Source references the Style
by its authored id.

Keep the video's particular copy and media as inputs. The component draws its own graphic
structure and can ship reusable assets such as fonts or icons. Its example Source should show the
states that matter, including how it behaves with different content or a changed event time.

The package's README and vocabulary give authors enough information to choose and use it. New visual
behavior belongs in this package; a Provider handles external execution when the graph needs it.
