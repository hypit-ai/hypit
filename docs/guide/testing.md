---
title: Testing
description: Test runner, patterns and environment-gated tests.
---

# Testing

## Test runner

Narratage uses the Node.js built-in test runner (`node:test`), not Jest, Vitest or Mocha.

```bash
pnpm test          # package tests + boundary tests
```

Test files live in `packages/<name>/test/` with the `.test.ts` extension. They are discovered by
the glob `packages/*/test/**/*.test.ts`.

## Writing a test

```typescript
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { someFunction } from "@narratage/example";

describe("someFunction", () => {
  test("returns the expected result", () => {
    const result = someFunction(input);
    assert.deepStrictEqual(result, expected);
  });
});
```

## Admission rule

A test belongs in the default suite only when it protects an observable contract, an architectural
boundary, or a failure mode that could corrupt work, repeat paid execution, or make an environment
unsafe. Test that fact once at its owning layer; use one checked-in graph fixture for cross-package
assembly instead of rebuilding the same partial video in every higher layer.

Do not add tests merely to make every package appear covered, mirror a Manifest array, preserve a
removed pre-release flag or database shape, or exercise documentation-only UI helpers. Package
locks and component registration already reject Manifest/implementation drift. Obsolete tests are
deleted with obsolete behavior rather than retained as project history.

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

These run as part of `pnpm test` on every commit.

## Environment-gated tests

| Command | What it tests | Prerequisites |
|---|---|---|
| `pnpm test:whisperx-service` | Python WhisperX service | Python 3.13, uv, frozen sync |
| `pnpm test:image-opencv` | OpenCV image transforms | `SVML_OPENCV_TESTS=1`, `SVML_OPENCV_PYTHON` |
| `pnpm smoke:kie` | Live paid KIE generation | `KIE_API_KEY` |

## Test fixtures

Test fixtures go in `packages/<name>/test/fixtures/`. They are
ordinary `.svml`, `.svs` and `.svrun` files that exercise specific compilation paths.

The `examples/` directory also serves as integration-level fixtures:
- `examples/bootstrap/` — smallest source closure check
- `examples/talking-film-graph-check/` — complete graph compilation without Providers
- `examples/talking-head-aroll/` — live acceptance with explicit historical-Candidate reuse
