---
title: Testing
description: Test runner, patterns and environment-gated tests.
---

## Test runner

Hypit uses the Node.js built-in test runner (`node:test`), not Jest, Vitest or Mocha.

```bash
pnpm test                                # all deterministic owner, composition and workflow tests
node test/run.mjs package kernel         # one package owner
node test/run.mjs workflow narrative-caption
node test/run.mjs environment browser-capture
node test/run.mjs environment caption-layout
node test/run.mjs environment cli-network
node test/run.mjs environment html-browser
node test/run.mjs environment studio-host
node test/run.mjs environment whisperx-local
node test/run.mjs environment runtime-process
node test/run.mjs environment runtime-scale
node test/run.mjs environment media-local
node test/run.mjs environment image-opencv
```

Tests are organized by the fact they verify:

- `packages/<name>/test/behavior/` owns package invariants and state transitions;
- `packages/<name>/test/composition/` verifies one direct package boundary;
- `test/workflows/` contains a small number of real cross-package repository workflows;
- environment-owned browser, media, Python and process checks use explicit commands.

The runner selects these paths directly. It does not maintain tags, an impact database, dependency
guesses or a central suite manifest. Tests that wholly depend on one environment live under their
owner's `test/environment/` directory and are excluded from the default and `package` selections.
Mixed files are split before they move: a pure parser or request check is not reclassified merely
because a neighboring test uses a browser. Flat package test files remain discoverable while older
tests are moved to their owner directories.

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

## Default-suite rule

A test belongs in the default suite only when it protects an observable contract, an architectural
boundary, or a failure mode that could corrupt work, repeat paid execution, or make an environment
unsafe. Test that fact once at its owning layer; use one checked-in graph fixture for cross-package
assembly instead of rebuilding the same partial video in every higher layer.

Do not add tests merely to make every package appear covered, mirror a Manifest array, preserve a
removed pre-release flag or database shape, or exercise documentation-only UI helpers. Component
registration already rejects Manifest/implementation drift. Obsolete tests are
deleted with obsolete behavior rather than retained as project history.

## Test patterns

### Owner behavior

Verify a value, decoder, transition or constructor at the package that defines it. Compile an Author
or Run Source only when compilation is the owned behavior. Never call an external service.

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

### Boundary composition and workflows

Package boundaries are expressed by package manifests, public entry points and shared contracts.
Composition tests exercise one direct handoff. A repository workflow may cross several packages,
but starts from real public Source/Run/Result input and asserts the user-visible outcome rather than
reconstructing every layer with a shared object fixture. The repository deliberately does not use
source-text regex tests as a substitute for dependency analysis or architectural review.

Do not commit customer or brand fixtures, credential traces, paid output artifacts, absolute
workstation paths or one-off delivery harnesses. Generic live tests may remain only when they are
explicitly opt-in, use no committed secret and incur no cost when not enabled.

## Environment-gated tests

| Command | What it tests | Prerequisites |
|---|---|---|
| `node test/run.mjs environment browser-capture` | browser capture and launcher integration | selected Chrome; ffprobe for recording |
| `node test/run.mjs environment caption-layout` | browser-rendered Fine Caption geometry | selected Chrome |
| `node test/run.mjs environment cli-network` | loopback OAuth callback and timeout lifecycle | permission to bind a local loopback port |
| `node test/run.mjs environment html-browser` | local HTML rasterization, browser acquisition, readiness and process behavior | loopback networking; Chrome, ffmpeg, ffprobe and `zip` where selected |
| `node test/run.mjs environment studio-host` | Studio loopback mutation transport and real filesystem watching | loopback networking and host filesystem watchers |
| `node test/run.mjs environment whisperx-local` | Local WhisperX Provider transport and canonical audio staging | permission to bind a local loopback port |
| `node test/run.mjs environment runtime-process` | Local Runtime worker, process and executable CLI lifecycle | local process, signal and platform credential environment |
| `node test/run.mjs environment runtime-scale` | high-concurrency Local Runtime execution | local process and SQLite environment |
| `node test/run.mjs environment media-local` | Local Media Provider, CLI media operations and exact media timing | ffmpeg and ffprobe available through `PATH` |
| `pnpm test:whisperx-service` | Python WhisperX service | Python 3.13, uv, frozen sync |
| `pnpm test:image-opencv` | the OpenCV Provider across Transform and Compose | the Provider's interpreter at `packages/provider-image-opencv-local/runtime/.venv`; set `HYPIT_OPENCV_PYTHON` to use another |

## Test fixtures

A checked-in `.svml`, `.svs` or `.svrun` fixture belongs beside the package behavior,
boundary composition or repository workflow that owns the fact it demonstrates. There
is no repository-wide fixture registry and no fixture should silently choose a Model,
Provider, public Output or recovery rule for unrelated tests.

Examples are public demonstrations. They become test fixtures only when a workflow runner explicitly
executes them with stable inputs and assertions; their mere presence does not claim test coverage.
