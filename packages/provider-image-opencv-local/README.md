# `@narratage/provider-image-opencv-local`

Local OpenCV/NumPy realization of `@narratage/image-transform`.

It reads one content-addressed image Artifact, runs the closed-data operation list in a bounded
child process and stores one new image Artifact. Temporary paths, OpenCV details and diagnostics
stay inside the Endpoint/Receipt and never enter the image Product.

The configured Python executable must provide `cv2` and `numpy`. The repository ships the locked
deployment environment in `services/image-opencv`; run
`uv sync --project services/image-opencv --frozen` once, then configure `pythonExecutable` as
`./services/image-opencv/.venv/bin/python`. Runtime admission and inner image work share the
configured Endpoint lane; no separate queue is hidden in this package.
