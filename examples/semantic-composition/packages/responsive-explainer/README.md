# Responsive explainer

One scene coordinates a playing performance and the diagram it makes room for. This intentionally
small example can be adapted to the video's own visual idea; its HTML and motion live in `src/render.ts`.

With normalized media, its exact source Window, a projected Instant, Canvas and exact FontStack
already available:

```svml
<import as="explainer" from="@example/responsive-explainer@1"/>

<explainer:Scene id="scene" timeline={speech.timeline}
  within={canvas.bounds} font={font} media={speaker-media.media} source-window={speech.speaker}
  during={speech.window} reveal={demonstrate} title="Make room for meaning"
  transition-frames="24"/>

<film:Film id="main" canvas={canvas.canvas} timeline={speech.timeline} appearance={look.film}>
  <film:Track id="scene" source={scene.visual}/>
  <film:Track source={mix.audio}/>
  <film:Track id="captions" source={captions.visual}/>
</film:Film>
```

`during` accepts a resolved Window. `reveal` accepts an absolute Instant, such as the output projected from
`@{demonstrate!}` before the relevant word. Rewriting the Script or using another delivery changes
the upstream projected frame while retaining the layout behavior.
`transition-frames` is the duration of that change, separate from the scene's lifetime. The
`<film:Track id="...">` membership names and places this scene among other contributions. The caller supplies
its title and exact fonts.

The explicit source Window exactly matches the media length. The component intersects that Window
with its own lifetime and preserves the corresponding source offset. The
parent viewport changes size and position; playback is never restarted by the layout change. The
component owns the diagram and the viewport, so its internal overlap, rounded clipping and backdrop
blur are ordinary HTML/CSS relationships. A peer Audio Clip independently publishes
`mix.audio` using the same media and Window.

`src/activation.ts` declares the Module, Surface, absolute time construction and Producer Fragment.
`src/render.ts` emits a HTML visual with HTML slots for typed video and text children. Its render
function computes state directly from local frame time, supporting direct seeking, range renders
and independent workers.

The package builds against `@hypit/hypit` and emits JavaScript. In a standalone project, replace the
repository's `workspace:*` development dependency with the Hypit version you use. Run `npm run build`
and connect this directory through an ordinary `file:` dependency during development. Cross-project
sharing can use a tarball or a versioned package under the owner's scope.
