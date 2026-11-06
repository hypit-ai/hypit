# `@hypit/provider-image-opencv-local`

Local OpenCV/NumPy realization of `@hypit/raster-composition`'s
`render-raster-composition` capability.

Each Need runs in a bounded child process and returns one baked PNG Resource. Decoding, spatial
sampling, interpolation, alpha composition and encoding remain private implementation steps rather
than a public generic image-transform language. Temporary paths, OpenCV details and
diagnostics stay inside the Endpoint and never enter the author language.

The Provider ships its frozen deployment source in `runtime/`. With the Runtime
Adapter's declared configuration, `programs up` installs it only when the machine Program Home has no
healthy environment; the Endpoint, program probe and doctor all resolve the shared `.venv`
interpreter. An explicit `pythonExecutable` selects an operator-managed compatible environment and
suppresses the managed installation. The Endpoint call and
inner image work share the configured capacity resources; no separate scheduler is hidden in this package.
