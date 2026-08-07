# SVML local OpenCV runtime

This is the locked Python environment used by `@svml/provider-image-opencv-local`. It is deployment
state, not an author-importable SVML package, a queue, a service daemon or part of Core.

Install it once:

```bash
uv python install 3.13
uv sync --project services/image-opencv --frozen
uv run --project services/image-opencv --frozen --no-sync python -c \
  'import cv2, numpy; print(cv2.__version__, numpy.__version__)'
```

Then configure the Provider with the environment's interpreter:

```json
{
  "use": "@svml/provider-image-opencv-local",
  "instance": "image.opencv.local",
  "config": {
    "pythonExecutable": "./services/image-opencv/.venv/bin/python",
    "defaultConcurrency": 2
  }
}
```

The Provider starts one bounded, shell-free Python process for each admitted Need. The ordinary
SVML Runtime Scheduler owns concurrency. The Python process reads only its explicit temporary input
and Program files and writes one explicit output image; it has no network, artifact-store, author
source or BuildState API.
