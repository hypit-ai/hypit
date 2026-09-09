# Semantics-driven composition

Design record · 2026-09-09

Working name: **语义驱动的自由编排**. The organizing principle is to choose component boundaries
according to shared visual behavior. Separate independent contributions; keep coordinated behavior
together. Semantic time connects that behavior to the intended expression.

**Status:** implemented and exercised with existing production media on 2026-09-09. Speech now
publishes semantic time and original audio; Media and project components own visual presentation.
Package interfaces, examples, vocabulary and production guidance have been updated together.

The [understanding and composition rationale](semantic-understanding-and-audiovisual-composition.md)
explains the production philosophy this change continues. Exact interfaces remain with their packages.

## The production that exposed the boundary

The owner described a launch video whose opening shows a full-frame talking head with a title and
a darkening treatment. On a spoken word, the same playing video moves to the right and acquires a
portrait-shaped viewport. A flowchart appears in the space it releases. This record uses that
description as the motivating case; it does not claim an independent viewing or measured timings.

The expressive relationship is straightforward: the speaker introduces an idea, then makes room
for its explanation while continuing to speak. Video movement and diagram layout jointly perform
that handoff. Independent Captions and other appearances can continue around it.

The earlier banana-cat production exposed the same conceptual split through a workaround: it used
Media to display a performance in a split layout while Speech also owned its presentation elsewhere.
That demonstrated that the performance could be consumed by another visual component. Displaying a
source more than once can be intentional; needing to duplicate its presentation just to escape its
semantic component's layout reveals the wrong responsibility boundary.

The resulting question is why adapting a renderer into Hypit should make an ordinary composition
awkward to express. The investigation points to compulsory visual ownership, not to long-running
execution or semantic authoring being unnecessary.

## The conflation to remove

A-roll identifies the performance that establishes the semantic timeline. Its semantic role does
not determine its size, position, visibility, stacking, or which component presents its picture.

The previous Speech interface required visual authoring choices while assembling the semantic performance.
That made a semantic source feel like a predefined visual layer. Media already had its own presentation
interface; Speech exposed another interface for much of the same work. New motion tended to become
an extra transform of an already assembled Track, or a duplicated Media presentation.

The intended separation is:

| Responsibility | What it owns |
| --- | --- |
| Material preparation | The actual visual and audio resources, normalization, and Take facts. |
| Semantic assembly and projection | Segment order, performance spans, words, and the concrete times of authored relationships. |
| Visual composition | Which material is visible, its framing and sampling, coordinated layout, motion, masks, and graphic behavior. |
| Audio composition | Which sound resources play, their timing, and mix. Visual placement does not implicitly add another copy of the speech. |

These are responsibilities, not a proposal for four mandatory new packages. Existing packages and
projections should carry them where they already fit. In particular, Speech should assemble the
semantic performance and provide its audio projection without requiring or emitting visual layout.
Visual components should consume the material and timing through explicit public inputs.

## Let shared behavior define the component

A component is a unit of authored behavior. It can own several videos, pictures, text elements and
their spatial relationships. A Track is a contribution it can produce; it need not correspond to
one source asset, one semantic role, or one unchanging rectangular layer.

For the motivating case, a component can own the moving performance viewport and the accompanying
diagram. It receives the material, the change Moment, the active Selection, diagram content and
useful appearance controls. Its implementation coordinates the handoff.

If the viewport transformation is useful on its own, it can be a smaller reusable component. If the
diagram and viewport depend on one another throughout the motion, they can stay together. Independent
Captions, a later B-roll cover or a standalone icon can remain separate contributions. A one-off
project component is a normal way to make a particular video; future reuse does not need to be
predicted before authoring it.

Ranking already offers the right intuition: a component owns images that move between meaningful
states. Video can be content in the same kind of authored relationship. Semantic role does not make
its pixels immovable.

This principle preserves useful layering. DOM hierarchy, paint order, clipping and filter scopes
remain real visual relationships. The change removes a predetermined business partition that keeps
jointly behaving content apart.

## Reuse the relationship to the words

An animation triggered at a fixed second reuses an implementation. An animation triggered by a
Moment in the Script also reuses its relationship to the message. A Selection can give the enclosing
passage its lifetime while a Moment triggers a state change within it.

The author chooses those semantic relationships. Existing projection turns them into concrete
windows and instants; the visual component consumes the projected values. The renderer continues
to evaluate visual behavior at frames. Speech parsing and model knowledge need not move into it.

When the person, product, wording or delivery changes, the intended trigger can remain meaningful
at a different time. Layout and content may also change with the new Treatment. Reuse preserves an
expressive relationship where it still serves the target, rather than requiring the new work to fit
the reference's seconds or geometry.

AIGC makes this especially useful. The author can decide the words, Segments, references and semantic
events before producing the performance. The generated material realizes that direction; normalized
Take facts and semantic alignment establish its actual timing.

Three facts stay distinct:

- semantic structure and event identities can be authored before material exists;
- requested generation duration is a production choice, informed by Script and delivery;
- exact target seconds and frames follow the actual selected performance.

This is early intent with later timing, not a promise to know final frame positions before generation.
Existing or recorded media remains usable through the same material and semantic preparation.
Wordless passages retain their meaningful Segment structure as well.

## Separate playback from its presentation

The same video must keep advancing while its viewport moves, changes shape or joins another layout.
The viewport can crop or reframe the source without distorting the person or restarting playback.

Material source time, composition time and animation-local time serve different purposes. Projected
semantic time places the behavior; the selected Take's media mapping identifies the source frame;
the visual animation changes its presentation. An outer Selection defines where the component is
active, but does not by itself determine which source frame should play first.

The input design must make continuous playback practical across a layout change and across the
selected performance spans. It should preserve the existing distinction between media sampling
and element animation. Picture use and speech-audio inclusion remain independently explicit.

These are visible production requirements, not reasons to add another global timeline database.

## Compositing must follow the same ownership principle

A coordinated push, crossfade or shared blur should be expressible where the participating content
and its relationship are owned. Treating every source as an independent opaque layer creates the
need to reconstruct those relationships through downstream Track transformations.

Explicit component inputs preserve modularity. When two contributions need shared behavior, their
boundary can change or an explicit composition scope can own that behavior. Reading arbitrary
siblings' private state is not the missing creative capability.

Some effects depend on already composed background pixels. Local blur, backdrop blur and blending
are different operations. Their required scope must be understood in the rendering model; labeling
all of them a cross-Track problem does not explain their actual needs.

The structural Visual IR already supported rooted element trees containing video, images and text,
but its finite vocabulary could not represent general browser layout or code. The implementation
adds an explicit renderer-program element alongside those structural elements. The rendering
package owns each program format and its execution; Core remains unaware of its contents.
HyperFrames' browser format places typed media and text children inside authored HTML, CSS and
frame-driven JavaScript. Backdrop filtering and blending are also available as structural styles.

## Why the language and long-running system still matter

Hypit connects reference understanding, material direction, long-running dependency execution and
visual composition. Later work often depends on a generated reference image, prepared media or the
duration and semantic timing of a completed performance. Those facts arrive at different times.

SVML expresses author intent and dependencies across that delayed evaluation. Its readable Script
connects the message to reusable behavior. The execution system preserves completed Outputs and
lets later Runs select them while downstream composition changes.

Material generation and final rendering both become Needs at the execution boundary. A Prompt Kit
helps author a generation request; a visual component helps author a composition consumed by a
renderer. They need not have identical internal APIs to participate in the same dependency system.

Core remains unaware of speakers, flowcharts, video viewports and particular renderers. Author
Packages, Models and Providers retain their separate extension responsibilities. A new visual
behavior should normally be a project package, and another render route should remain possible.
The purpose of this refactor is to align visual authoring with that existing extensibility.

## Implemented boundaries

| Owner | Responsibility |
| --- | --- |
| [Speech Track](../packages/speech-track/README.md) | Ordered semantic assembly and independently selected original audio. Visual configuration and output were removed. |
| [Semantic Track](../packages/semantic-track/README.md) | `projectSemanticMedia` exposes intersecting prepared Takes with program spans and source offsets. |
| [Media Track](../packages/media-track/README.md#display-a-semantic-performance) | `Performance` shows the enclosing Track's prepared semantic material under one frame and lifecycle across Take boundaries. |
| [Composition](../packages/composition/README.md) | A Present may contain a renderer program with an explicit format, payload and artifacts, alongside owned structural children. |
| [HyperFrames](../packages/hyperframes/README.md#local-browser-programs) | The browser program owns local HTML/CSS/JavaScript; typed children retain exact sampling and font resources. |
| [Responsive explainer](../examples/semantic-composition/README.md) | An ordinary project package demonstrates the shared video/diagram relationship, triggered by a Moment within a Window. |

The original audio projection remains because placing the prepared sound at its assembled time
is a useful direct operation with no visual decision. Film selects it explicitly. Independent audio
composition remains available for music, effects and other authored mixing choices.

Media names the source intention explicitly: `Performance` displays the enclosing Track's semantic
performance, while `Item` places an independently supplied source. The Track receives `semantic`
once. Both use a Window for visibility; Performance keeps the original source positions inside that
Window. Fitting, frame decoration, lifecycle motion and Sampling use the same Media implementation.
A project scene can consume the semantic material directly without adopting Media's author vocabulary.

The program format is renderer-specific; the generic `program` element is not. A future renderer
supports the formats it implements and reports an unsupported format otherwise. An authored browser
program computes each frame's complete state, allowing workers and range renders to start anywhere.
A program evaluation error fails that rendering attempt with its frame and error; a revised Run starts
a new Build using already produced material.

There is no current official Track-to-Track push-in package to remove. Ordinary Media motion remains
useful; shared scene motion now has a direct component boundary. This change removes Speech's
restricted Media adapter and duplicate visual projection instead of replacing them with another
central effect dispatcher. Public format identifiers remain at `@1`.

## Validation

- The Performance Surface shares the Track's semantic input and the common Media presentation path.
  Its tests cover source offsets and Sampling motion across Take boundaries. Nineteen production
  Sources check with the new spelling. Build `bld_20260909T085036240Z_DAA444FC00` rendered a two-second
  interval with Performance, Sampling, Caption and original audio, using an existing SemanticTake.
- Speech tests cover ordered audio and selected source offsets, including audio-only intervals.
- Media tests cover one Window spanning several Takes, with one shared lifecycle and exact source mapping.
- Browser program tests cover local structure, typed resources, format errors, direct seeks and authored failures.
- Existing ranking material rendered at 960 × 540 with four workers; a 48-frame transition interval
  rendered independently with two workers. Inspection confirmed uninterrupted playback, the moving
  portrait viewport, entering diagram and local backdrop blur. The interval and full render matched
  in content and state, with expected independent video-encoding differences.
- A complete CLI Build reused an existing SemanticTake through SVRun, then composed the scene,
  original audio and independent fine Caption. Its plan contained only three local Needs: visual
  render, audio render and mux. No generation or transcription was run. The resulting MP4 is 11.03 seconds.
- Full repository tests, type checking and public documentation build pass. Exact counts and local
  proof paths belong in the work report rather than a permanent API definition.

## Production knowledge

Semantic authoring remains in Script and time; choosing component boundaries is explained in
[component design](../skills/hypit/references/production/component-design.md). Drawing and browser
program use belong to [component visuals](../skills/hypit/references/production/component-visuals.md).
Media owns ordinary placement, and package READMEs retain exact interfaces. The Skill routes authors
by the relationship their video needs, without requiring them to learn this refactor's history.
