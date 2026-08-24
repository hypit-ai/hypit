# `@hypit/provider-image-opencv-local`

Local OpenCV/NumPy realization of the single `@hypit/raster` capability.

Image Transform and Image Compose lower their different author meanings to one closed RasterRequest.
One Handler stages its content-addressed inputs, and one Python interpreter shares decoding, fit,
interpolation, alpha and encoding primitives across both variants. It runs in a bounded child process
and stores one new image Artifact. Temporary paths, OpenCV details and diagnostics stay inside the
Endpoint and never enter the image Product.

The Distribution ships the frozen deployment source from `services/image-opencv`. With the Runtime
Adapter's declared configuration, `programs up` installs it only when the machine Program Home has no
healthy environment; the Endpoint, program probe and doctor all resolve the shared `.venv`
interpreter. An explicit `pythonExecutable` selects an operator-managed compatible environment and
suppresses the managed installation. Runtime admission and
inner image work share the configured Endpoint pool/lane resources; no separate queue is hidden in this package.
