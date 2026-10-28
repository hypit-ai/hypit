# Local OpenCV Provider runtime

This directory contains the locked Python environment material shipped by
`@hypit/provider-image-opencv-local`; the npm package owns its Provider adapter and lifecycle.

For an ordinary installed Distribution, select the Provider and let `hypit runtime up` create and
reuse this environment in the machine Program Home. The commands below are only for a contributor
or operator deliberately managing a custom interpreter:

```bash
uv python install 3.13
uv sync --project packages/provider-image-opencv-local/runtime --frozen
uv run --project packages/provider-image-opencv-local/runtime --frozen --no-sync python -c \
  'import cv2, numpy; print(cv2.__version__, numpy.__version__)'
```

Then configure the Provider with the environment's interpreter:

```json
{
  "use": "@hypit/provider-image-opencv-local",
  "instance": "image.opencv.local",
  "config": {
    "pythonExecutable": "./packages/provider-image-opencv-local/runtime/.venv/bin/python",
    "defaultConcurrency": 2
  }
}
```

The Provider starts one bounded, shell-free Python process for each admitted Need. The ordinary
SVML Runtime Scheduler owns concurrency. The Python process reads only its explicit temporary input
and Program files and writes one explicit output image; it has no network, Resource Store, author
source or BuildView API.
