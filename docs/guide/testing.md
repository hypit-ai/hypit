---
title: Testing
description: Test runner, patterns and environment-gated tests.
---

# Testing

## Test runner

Hypit uses the Node.js built-in test runner (`node:test`), not Jest, Vitest or Mocha.

```bash
pnpm test          # package tests + boundary tests
```

Test files live in `packages/<name>/test/` with the `.test.ts` extension. They are discovered by
the glob `packages/*/test/**/*.test.ts`.

## Writing a test

```typescript
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { someFunction } from "@hypit/example";

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
removed pre-release flag or database shape, or exercise documentation-only UI helpers. Component
registration already rejects Manifest/implementation drift. Obsolete tests are
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

### Architecture boundaries

Package boundaries are expressed by package manifests, public entry points and shared contracts.
Tests exercise observable behavior at those boundaries. The repository deliberately does not use
source-text regex tests as a substitute for dependency analysis or architectural review.

Do not commit customer or brand fixtures, credential traces, paid output artifacts, absolute
workstation paths or one-off delivery harnesses. Generic live tests may remain only when they are
explicitly opt-in, use no committed secret and fail before spending money unless their gate is set.

## Environment-gated tests

| Command | What it tests | Prerequisites |
|---|---|---|
| `pnpm test:whisperx-service` | Python WhisperX service | Python 3.13, uv, frozen sync |
| `pnpm test:image-opencv` | the shared OpenCV Raster interpreter across both request variants | the service's own interpreter at `services/image-opencv/.venv`; set `HYPIT_OPENCV_PYTHON` to use another |

For the local HyperFrames browser render tests, set `HYPIT_BROWSER_TESTS=1` in your shell environment, then run the command below from the repository root. Chrome, ffmpeg and ffprobe must be available.

```sh
node --import tsx --test packages/provider-hyperframes-local/test/provider.test.ts
```

## Test fixtures

Test fixtures go in `packages/<name>/test/fixtures/`. They are
ordinary `.svml`, `.svs` and `.svrun` files that exercise specific compilation paths.

The `examples/` directory also serves as integration-level fixtures:
- `examples/interview/`, `examples/podcast/` and `examples/ranking-football/` — complete video projects with Sources, Runs and assets.
- `examples/minimal-author-package/` — a complete component package with a Surface preview.
