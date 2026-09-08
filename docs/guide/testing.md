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
import test from "node:test";

import { someFunction } from "@hypit/example";

test("someFunction returns the expected result", () => {
  assert.deepStrictEqual(someFunction(input), expected);
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
| `pnpm smoke:kie` | Live paid KIE generation | `KIE_API_KEY` |

One browser-gated test has no package script of its own. Run it through the Node test runner
directly:

```bash
HYPIT_BROWSER_TESTS=1 node --import tsx --test packages/provider-hyperframes-local/test/provider.test.ts
```

It renders a real silent MP4 through the installed HyperFrames CLI, so it needs a Chrome that CLI
can start and `ffmpeg`. Run the same file without `HYPIT_BROWSER_TESTS=1` and that one test skips
while the rest of the file still runs, which is what `pnpm test` does.

## Test fixtures

Test fixtures go in `packages/<name>/test/fixtures/`. They are
ordinary `.svml`, `.svs` and `.svrun` files that exercise specific compilation paths.

The `examples/` directory also serves as integration-level fixtures:
- `examples/interview/`, `examples/podcast/` and `examples/ranking-football/` — complete video
  examples, each carrying SVML, SVS and SVRun sources beside its assets. The nested directories are
  independent variants or explicit prior-Build reuse projects.
- `examples/minimal-author-package/` — a package-authoring fixture, not a video example. It is the
  smallest complete component package, down to a Surface preview asset.
