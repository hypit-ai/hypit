---
title: 测试
description: 测试运行器、测试模式与环境门控的测试。
---

# 测试

## 测试运行器

SVML 使用 Node.js 内置的测试运行器（`node:test`），而不是 Jest、Vitest 或 Mocha。

```bash
pnpm test          # everything: v1 + v2
pnpm test:v1       # v1 regression tests
pnpm test:v2       # v2 package tests + boundary tests
```

测试文件位于 `packages/<name>/test/`，扩展名为 `.test.ts`。它们通过 glob `packages/*/test/**/*.test.ts` 被发现。

## 编写测试

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

## 测试模式

### 纯编译测试

最常见的模式。编译一份 Author Source 或 Run Source，然后对生成的图、导出、Record 或计划步骤做断言。绝不调用外部服务。

```typescript
test("compiles the expected exports", async () => {
  const compiler = createCompiler({ root, packageContributions });
  const workspace = await compiler.openFile("fixture.svml");
  const result = await compiler.compileSource(workspace.entry, workspace);
  assert.equal(result.exports.length, 3);
});
```

### Provider 测试

用真实或模拟的外部服务测试 Endpoint 实现。这类测试由环境门控：检查所需的凭据或可执行文件，缺失时跳过。

```typescript
test("generates a video", async (t) => {
  if (!process.env.KIE_API_KEY) {
    t.skip("KIE_API_KEY not set");
    return;
  }
  // ... real API call
});
```

### Boundary 测试

`tools/package-boundaries.test.mjs` 和 `tools/graph-first-value-boundary.test.mjs` 会在整个 workspace 范围内校验结构性不变量：

- 依赖图无环
- 领域中立闭包中只包含领域中立的包
- CLI 不依赖任何 Provider 或作者包

它们作为 `pnpm test:v2` 的一部分，在每次提交时运行。

## 受环境开关控制的测试

| 命令 | 测试内容 | 前置条件 |
|---|---|---|
| `pnpm test:whisperx-service` | Python WhisperX 服务 | Python 3.13、uv、frozen sync |
| `pnpm test:image-opencv` | OpenCV 图像变换 | `SVML_OPENCV_TESTS=1`、`SVML_OPENCV_PYTHON` |
| `pnpm smoke:kie` | 实时付费的 KIE 生成 | `KIE_API_KEY` |

## 测试 fixtures

测试夹具放在 `packages/<name>/test/fixtures/` 或 `test/fixtures/`（v1）。它们是普通的 `.svml`、`.svs` 和 `.svrun` 文件，用于覆盖特定的编译路径。

`examples/` 目录同时充当集成级别的夹具：
- `examples/v2-bootstrap/` — 最小源闭包检查
- `examples/talking-film-graph-check/` — 不含 Provider 的完整图编译
- `examples/echo-pro-aroll/` — 显式复用历史 Candidate 的实时验收
