# `@hypit/html-render-local`

Renderer-neutral local execution shared by direct applications and concrete Chromium or Electron packages.
It stages selected `HtmlProgram` resources, applies request limits, supervises disposable workers,
prepares exact source samples, reports progress and stores completed output.

This package has no Endpoint or Runtime contract. It contains no Puppeteer, Chromium installation,
Electron executable, shared-texture implementation or browser runtime. Callers supply an explicit
capture backend, ResourceStore, diagnostics sink and worker launch for each request. Provider-specific
configuration and activity mapping live in `@hypit/html-runtime-local`.

An execution may declare `webGpu: "required"`. The generic renderer carries that finite Host requirement to the
selected capture backend; it does not inspect HTML text, silently fall back to another compositor or make WebGPU
part of `HtmlProgram` semantics.

Importing the package has no process-lifecycle effect. A capture worker explicitly installs its own
emergency descendant cleanup after it owns the worker process and releases that cleanup after normal
resource closure.
