---
title: Component Anatomy
description: Turn a scene's creative interface into a reusable graph contribution.
---

A component connects an author-facing idea to its implementation. For a ranking board, that idea
might be “introduce each contender on its line, then move its icon into the ranked position.” Its
inputs express those relationships; its code supplies the drawing and motion.

Start with [Adding an Author Package](./author-packages.md) for a complete buildable example.
[Ranking](https://github.com/hypit-ai/hypit/blob/main/packages/ranking/README.md) is a richer example
of semantic events, persistent state and a Studio Companion.

## The implementation roles

These roles can be organized into files that suit the component's size:

| Role | Responsibility |
| --- | --- |
| Manifest and Types | Name the values, Producers, inputs and outputs the package provides |
| Surface | Read the authored element and resolve its explicit inputs |
| Fragment | Describe the operations and dependencies connecting those inputs to outputs |
| Producer | Perform the declared computation |
| Value and Style helpers | Validate inputs, apply documented defaults and decode the accepted Recipe properties |
| Schedule and drawing | Project events and draw the scene at each frame |
| Activation | Publish the contributions the selected package offers |
| Studio Companion | Describe timeline Items and editable properties for Studio |

The [Author Package guide](./author-packages.md) and included example route each exact object shape to
its owning API. A small component can keep related roles together;
a larger component benefits from separating reusable scheduling, styling and drawing logic.

## Design around relationships

For spoken work, an upstream Narrative Projection turns selected semantic identities into named
absolute Windows and Instants after the performance exists. A component accepts those same absolute
types for behavior tied to the words. For an authored animation, Timeline declarations can produce
them directly from seconds or frames. A duration such as `12f` can still describe the component's
local transition length.

Media presentation, spatial layout and time each have their own inputs. PreparedMedia supplies a
finite local media domain; a Window states when the occurrence contributes; a separate temporal
sampling relation states which part of moving media is sampled. A Frame can locate the scene, while its internal HTML/CSS or element tree coordinates videos,
text, masks and graphics. Group content that shares behavior. Independent contributions can stay
as peer Tracks with their own paint order.

A caption component benefits from the existing caption document, style selection and semantic
timing. Use the fine-caption family for the styles it expresses; a new family can consume those
same caption relationships and draw a different visual treatment.

## Make it useful to another author

Choose parameter names from the creative decision: the reveal event, the content, the placement,
the appearance. Document defaults and what an override changes. A Style decoder receives an SVS
Recipe shaped as `{ path, properties }` and explicit font resources; a Source references the Style
by its authored id.

Keep the video's particular copy and media as inputs. The component draws its own graphic
structure and can ship reusable assets such as fonts or icons. Its example Source should show the
states that matter, including how it behaves with different content or a changed event time.

The package's README and vocabulary give authors enough information to choose and use it. A Studio
Companion can add editing handles for the source values that have a clear interpretation. New visual
behavior belongs in this package; a Provider handles external execution when the graph needs it.
