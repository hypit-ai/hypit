# `@hypit/provider-image-opencv-local`

Local OpenCV/NumPy realization of the two deterministic capabilities owned by
`@hypit/raster-transform` and `@hypit/raster-composition`: `transform-raster` and
`render-raster-composition`.

Transform and Compose remain separate Needs. One Provider implements both while its private Python
interpreter shares decoding, fit, interpolation, alpha and encoding primitives. Each Need runs in a
bounded child process and returns one new image Resource. Temporary paths, OpenCV details and
diagnostics stay inside the Endpoint and never enter the author language.

The Provider ships its frozen deployment source in `runtime/`. With the Runtime
Adapter's declared configuration, `programs up` installs it only when the machine Program Home has no
healthy environment; the Endpoint, program probe and doctor all resolve the shared `.venv`
interpreter. An explicit `pythonExecutable` selects an operator-managed compatible environment and
suppresses the managed installation. The Endpoint call and
inner image work share the configured capacity resources; no separate scheduler is hidden in this package.
