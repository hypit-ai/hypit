# Bootstrap source example

This is the smallest real-file example for the official Markup compiler Host. It proves that a
self-described Markup entry source can import the Script Surface and recursively compile an SVS
source selected by another Header. There is no built-in video prelude or suffix-selected parser:

```bash
node --run narratage -- check examples/bootstrap/main.svml \
  --package-lock examples/talking-film-graph-check/svml.packages.lock --root .
```

The Recipe is intentionally unused. This example therefore checks Source/Module Closure and
authored Records but has no component Logical Output to `plan` or execute.
