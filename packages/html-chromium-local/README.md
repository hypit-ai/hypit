# `@hypit/html-chromium-local`

Direct Chromium implementation of local `HtmlProgram` rasterization.

The package owns exact Chromium selection, browser compatibility, worker launch and PNG capture. It
accepts a caller-owned ResourceStore through the renderer-neutral `@hypit/html-render-local` API and
contains no Endpoint, Runtime, Build or NLE policy. Applications may call it directly; the separate
Chromium Provider package adapts the same functions to Runtime execution.

Rendering is read-only with respect to the tool environment. `chromePath` selects an installed
browser; omitting it selects this package release's exact managed-browser location, which must have
been prepared explicitly by the surrounding application or Provider adapter.
