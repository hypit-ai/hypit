---
title: Testing
description: Test runner, patterns and environment-gated tests.
---

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
  const workspace = await compiler.openEntry("fixture.svml");
  const result = await compiler.compileResolvedSource(workspace.entry, workspace);
  assert.equal(result.exports.length, 3);
});
```

### Provider tests

Exercise request mapping, media transport and task progression, including failures, against a controlled service fixture.
The [project Provider example](https://github.com/hypit-ai/hypit/tree/main/examples/provider-package)
includes a lifecycle test that collects a returned image without spending on generation. Live calls
use the selected service and explicit spending scope; an available key alone does not authorize them.

### Architecture boundaries

Package boundaries are expressed by package manifests, public entry points and shared contracts.
Tests exercise observable behavior at those boundaries. The repository deliberately does not use
source-text regex tests as a substitute for dependency analysis or architectural review.

Do not commit customer or brand fixtures, credential traces, paid output artifacts, absolute
workstation paths or one-off delivery harnesses. Generic live tests may remain only when they are
explicitly opt-in, use no committed secret and incur no cost when not enabled.

## Environment-gated tests

| Command | What it tests | Prerequisites |
|---|---|---|
| `pnpm test:whisperx-service` | Python WhisperX service | Python 3.13, uv, frozen sync |
| `pnpm test:image-opencv` | the OpenCV Provider across Transform and Compose | the Provider's interpreter at `packages/provider-image-opencv-local/runtime/.venv`; set `HYPIT_OPENCV_PYTHON` to use another |
| `pnpm test:browser` | capture-browser pixels, recordings and CLI capture | a prepared capture browser (`node bin/hypit.mjs capture install-browser`), ffmpeg and ffprobe |

`pnpm test` keeps the capture-browser files in the suite but skips their browser-dependent tests.
That browser is installed outside pnpm, CI has none, and a prepared machine would otherwise run
several Chrome instances beside the ordinary suite. `pnpm test:browser` enables them explicitly,
one file at a time, so each test keeps the wall-clock budget measured for it standalone. The
browser-free assertions in those files still run in `pnpm test`, exactly as they do in CI.

For the local HTML rasterization tests, set `HYPIT_BROWSER_TESTS=1` in your shell environment, then run the command below from the repository root. Chrome, ffmpeg and ffprobe must be available.

```sh
node --import tsx --test packages/provider-html-local/test/provider.test.ts
```

## Test fixtures

Test fixtures go in `packages/<name>/test/fixtures/`. They are
ordinary `.svml`, `.svs` and `.svrun` files that exercise specific compilation paths.

The `examples/` directory also serves as integration-level fixtures:
- `examples/interview/`, `examples/podcast/` and `examples/ranking-football/` — complete video projects with Sources, Runs and assets.
- `examples/minimal-author-package/` — a complete component package with a Surface preview.
