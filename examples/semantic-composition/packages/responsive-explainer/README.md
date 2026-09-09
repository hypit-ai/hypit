# Responsive explainer

One scene coordinates a playing performance and the diagram it makes room for. This intentionally
small example can be adapted to the video's own visual idea; its HTML and motion live in `src/render.ts`.

With prepared Takes, a Canvas and an exact FontStack already available:

```svml
<import as="explainer" from="@example/responsive-explainer@1"/>

<speech:Track id="speech">
  <speech:Take source={opening.take}/>
  <speech:Take source={explanation.take}/>
</speech:Track>
<explainer:Scene id="scene" semantic={speech.semantic} canvas={canvas} font={font}
  during="program" reveal={story.moment.demonstrate} title="Make room for meaning"
  transition-frames="24" stack-order="0"/>
<film:Film id="main" canvas={canvas} semantic={speech.semantic} appearance={look.film}>
  <film:Track source={scene.visual}/>
  <film:Track source={speech.audio}/>
  <film:Track source={captions.track}/>
</film:Film>
```

`during` also accepts a Script Selection or Segment; the shared Window syntax supports other authored
intervals. `reveal` selects a Script Moment, such as `@demonstrate!` before the relevant word. Rewriting
the Script or using another delivery changes the projected frame while retaining the layout behavior.
`transition-frames` is the duration of that change, separate from the scene's lifetime. `stack-order`
places this scene among other contributions. The caller supplies its title and exact fonts.

`projectSemanticMedia` selects all intersecting prepared Takes. Each video's target interval is
Present-local and its source offset is preserved. The parent viewport changes size and position;
playback is never restarted by the layout change. The component owns the diagram and the viewport,
so its internal overlap, rounded clipping and backdrop blur are ordinary HTML/CSS relationships.
The original audio stays independently selectable as `speech.audio`.

`src/activation.ts` declares the Module, Surface, semantic projections and Producer Fragment.
`src/render.ts` emits a browser program with HTML slots for typed video and text children. Its render
function computes state directly from local frame time, supporting direct seeking, range renders
and independent workers.

The package builds against `@hypit/hypit` and emits JavaScript. In a standalone project, replace the
repository's `workspace:*` development dependency with the Hypit version you use. Run `npm run build`
and connect this directory through an ordinary `file:` dependency during development. Cross-project
sharing can use a tarball or a versioned package under the owner's scope.
