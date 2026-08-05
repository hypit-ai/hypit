# v2 bootstrap source example

This is the smallest real-file example accepted by the current trusted v2 CLI prelude. It proves
that the Text entry source can import the Script Surface and recursively compile an SVS source with
another Frontend:

```bash
pnpm svml:v2 check examples/v2-bootstrap/main.svml
```

The Recipe is intentionally unused: package-owned Recipe consumption is the next author-language
decision. This example therefore checks Source/Module Closure and authored Records but has no
component Logical Output to `plan` or execute.
