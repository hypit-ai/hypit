# `@hypit/html-chromium-local`

Direct Chromium implementation of local `HtmlProgram` rasterization.

The package owns exact Chromium selection, browser compatibility, worker launch and PNG capture. PNG
capture implements both an explicit opaque matte and preserved straight alpha; encoded final-video
delivery remains the opaque path owned by the renderer delivery contract. It
accepts a caller-owned ResourceStore through the renderer-neutral `@hypit/html-render-local` API and
contains no Endpoint, Runtime, Build or NLE policy. Applications may call it directly; the separate
Chromium Provider package adapts the same functions to Runtime execution.

When an execution explicitly requires WebGPU, the disposable Chromium worker enables the WebGPU adapter before
loading the programme. Ordinary HTML capture does not receive that flag, and an unavailable adapter remains an
execution error rather than selecting another rendering root.

Rendering is read-only with respect to the tool environment. `chromePath` selects an installed
browser; omitting it selects this package release's exact managed-browser location, which must have
been prepared explicitly by the surrounding application or Provider adapter.
