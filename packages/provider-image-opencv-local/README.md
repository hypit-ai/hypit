# `@narratage/provider-image-opencv-local`

Local OpenCV/NumPy realization of the single `@narratage/raster` capability.

Image Transform and Image Compose lower their different author meanings to one closed RasterRequest.
One Handler stages its content-addressed inputs, and one Python interpreter shares decoding, fit,
interpolation, alpha and encoding primitives across both variants. It runs in a bounded child process
and stores one new image Artifact. Temporary paths, OpenCV details and diagnostics
stay inside the Endpoint/Receipt and never enter the image Product.

The repository ships the frozen deployment environment in `services/image-opencv`. With the Runtime
Adapter's default configuration, `services up` runs `uv sync --frozen` and the Endpoint, service probe
and doctor all resolve the resulting `.venv` interpreter. An explicit `pythonExecutable` selects an
operator-managed compatible environment and suppresses that managed prepare. Runtime admission and
inner image work share the configured Endpoint lane; no separate queue is hidden in this package.
