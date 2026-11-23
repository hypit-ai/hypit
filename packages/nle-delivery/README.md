# @hypit/nle-delivery

Compiles an accepted NLE snapshot using Project Media and the project’s selected npm packages.
`prepareNleCompilation` accepts an in-memory snapshot or reads the selected SVML document. Its result exposes the
exact programme duration and compiles one-frame capture requests, audio programs and video delivery plans for
the selected output profile. Studio can reuse preparation across requests for one revision and Composition.

`prepareNleComponentPicture` selects one placed Component by Composition and Item identity. It compiles the
Component within its own Picture region, using sample indices on the owning Composition's edit grid and the
same source and Item time mapping used in the programme. It resolves the selected Component's Media inputs.

The Project-scoped delivery Service owns Action handles, destination validation, progress and cancellation.
It submits closed plans to the injected HTML Video Executor. A completed Action returns a Media resource.

## Project package render contributions

A selected project package exports a contribution entry with kind `hypit.nle-render`. Its value follows
`NleRenderContribution`, exported by this package. Each implementation declares the package-local `symbol`
referenced by the edit and a `render(value, context)` function. The function receives closed values and, for
Components, resolved Media inputs and inline or shared slot values.

- A Component returns its local Picture `region`, optional exact `duration` and an `HtmlVisual`. An omitted duration
  describes a constant Picture. A timed visual produces the same result for a given local frame regardless of
  request order. Its SVML Present owns placement, source time and the selected parameters. The render contribution
  receives the finite `sourceDuration` needed by the occurrence. It can name an `itemTimeControl` for behaviors
  attached to the visible window, and read it through `context.controlPosition(name, outputFrame)`.
- A Picture Process or Adjust returns an `HtmlVisual` using `{{input:signal}}`. Transitions use `outgoing` and
  `incoming`, and Mattes use `content` and `matte`. Each effect can declare the local control names it reads.
- An Audio Process or Adjust returns an audio filter expression and its control names. Source reads use accepted Project Media.
- A Picture Reconstruction returns the sampling implementation for one timed Media Picture.

The compiler binds inputs and computes exact control mappings from the edit. Authoring, Inspector and Timeline
contributions remain independently selectable for the same package symbol. See the selected packages in
[the Jensen project](../../examples/ranking-jensen/) for complete examples.

To make the internal objects of a scene directly editable on the timeline, a project program can materialize them
as NLE Items in a Composition. [Component authoring](../../design/authoring.md#component-instances-and-expansion)

## Text fonts

Text Fine and Caption Fine use `typography.fonts` as an ordered list of font sources. Each entry is a system family
such as `system-ui`, a project-root-relative path such as `./assets/fonts/brand.woff2`, or an installed
`@fontsource/...` or `@fontsource-variable/...` package. The project package manifest and lockfile select the
installed version. Project files may be WOFF, WOFF2, TTF or OTF. Use concrete font sources when the text needs
to retain its glyphs and metrics across machines.

The project's render context resolves references through `resolveTextFont`. `nleTextFragment` compiles a text
tree, its base typography and per-run overrides, using the requested weight and style. Fontsource CSS selects
the published character subsets. The HTML Program embeds face declarations and stages the files required for
the requested frames.
