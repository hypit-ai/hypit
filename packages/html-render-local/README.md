# `@hypit/html-render-local`

Renderer-neutral local execution owned jointly by the Chromium and Electron HTML Endpoint packages.
It stages selected `HtmlProgram` resources, applies request limits, supervises disposable workers,
prepares exact source samples, reports progress and stores completed output.

This package does not select an Endpoint or renderer. It contains no Puppeteer, Chromium installation,
Electron executable, shared-texture implementation or browser runtime. Concrete Provider packages
supply an explicit capture backend and worker launch for each request.

Importing the package has no process-lifecycle effect. A capture worker explicitly installs its own
emergency descendant cleanup after it owns the worker process and releases that cleanup after normal
resource closure.
