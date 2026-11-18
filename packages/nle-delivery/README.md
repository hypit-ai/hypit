# @hypit/nle-delivery

Compiles an accepted NLE snapshot using Project Media and the project’s selected npm packages.
`prepareNleCompilation` accepts an in-memory snapshot or reads the selected SVML document. Its result exposes the
exact programme duration and compiles one-frame capture requests, audio programs and video delivery plans for
the selected output profile. Studio can reuse preparation across requests for one revision and Composition.

The Project-scoped delivery Service owns Action handles, destination validation, progress and cancellation.
It submits closed plans to the injected HTML Video Executor. A completed Action returns a Media resource.

## Project package render contributions

A selected project package exports a contribution entry with kind `hypit.nle-render`. Its value follows
`NleRenderContribution`, exported by this package. Each implementation declares the package-local `symbol`
referenced by the edit and a `render(value, context)` function. The function receives closed values and, for
Components, resolved Media inputs and inline or shared slot values.

- A Component returns its local Picture `region`, optional exact `duration` and an `HtmlVisual`. An omitted duration
  describes a constant Picture. A timed visual renders the requested local frame.
- A Picture Process or Adjust returns an `HtmlVisual` using `{{input:signal}}`. Transitions use `outgoing` and
  `incoming`, and Mattes use `content` and `matte`. Each effect can declare the local control names it reads.
- An Audio Process or Adjust returns an audio filter expression and its control names. Source reads use accepted Project Media.
- A Picture Reconstruction returns the sampling implementation for one timed Media Picture.

The compiler binds inputs and computes exact control mappings from the edit. Authoring, Inspector and Timeline
contributions remain independently selectable for the same package symbol. See the selected packages in
[the Jensen project](../../examples/ranking-jensen/) for complete examples.
