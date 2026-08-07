---
title: Testing
description: Test runner, patterns and environment-gated tests.
---

# Testing

## Test runner

SVML uses the Node.js built-in test runner (`node:test`), not Jest, Vitest or Mocha.

```bash
pnpm test          # everything: v1 + v2
pnpm test:v1       # v1 regression tests
pnpm test:v2       # v2 package tests + boundary tests
```

Test files live in `packages/<name>/test/` with the `.test.ts` extension. They are discovered by
the glob `packages/*/test/**/*.test.ts`.

## Writing a test

```typescript
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { someFunction } from "@svml/example";

describe("someFunction", () => {
  test("returns the expected result", () => {
    const result = someFunction(input);
    assert.deepStrictEqual(result, expected);
  });
});
```

## Test patterns

### Pure compilation tests

The most common pattern. Compile an Author or Run Source and assert on the resulting graph,
exports, Records or plan steps. Never calls an external service.

```typescript
test("compiles the expected exports", async () => {
  const compiler = createCompiler({ root, packageContributions });
  const workspace = await compiler.openFile("fixture.svml");
  const result = await compiler.compileSource(workspace.entry, workspace);
  assert.equal(result.exports.length, 3);
});
```

### Provider tests

Test Endpoint implementations with real or simulated external services. Environment-gated: check
for required credentials or executables and skip when absent.

```typescript
test("generates a video", async (t) => {
  if (!process.env.KIE_API_KEY) {
    t.skip("KIE_API_KEY not set");
    return;
  }
  // ... real API call
});
```

### Boundary tests

`tools/package-boundaries.test.mjs` and `tools/graph-first-value-boundary.test.mjs` verify
structural invariants across the entire workspace:

- Acyclic dependency graph
- Domain-neutral closure contains only domain-neutral packages
- CLI has no Provider or author-package dependency

These run as part of `pnpm test:v2` on every commit.

## Environment-gated tests

| Command | What it tests | Prerequisites |
|---|---|---|
| `pnpm test:whisperx-service` | Python WhisperX service | Python 3.13, uv, frozen sync |
| `pnpm test:image-opencv` | OpenCV image transforms | `SVML_OPENCV_TESTS=1`, `SVML_OPENCV_PYTHON` |
| `pnpm smoke:kie` | Live paid KIE generation | `KIE_API_KEY` |

## Test fixtures

Test fixtures go in `packages/<name>/test/fixtures/` or `test/fixtures/` (v1). They are
ordinary `.svml`, `.svs` and `.svrun` files that exercise specific compilation paths.

The `examples/` directory also serves as integration-level fixtures:
- `examples/v2-bootstrap/` — smallest source closure check
- `examples/talking-film-graph-check/` — complete graph compilation without Providers
- `examples/echo-pro-aroll/` — live acceptance with explicit historical-Candidate reuse
