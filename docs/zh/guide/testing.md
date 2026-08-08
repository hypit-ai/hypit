---
title: 测试
description: 测试运行器、测试模式与环境门控的测试。
---

# 测试

## 测试运行器

Narratage 使用 Node.js 内置的测试运行器（`node:test`），而不是 Jest、Vitest 或 Mocha。

```bash
pnpm test          # 包测试 + boundary 测试
```

测试文件位于 `packages/<name>/test/`，扩展名为 `.test.ts`。它们通过 glob `packages/*/test/**/*.test.ts` 被发现。

## 编写测试

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

## 准入规则

默认测试集只保留三类测试：可观察合同、架构边界，以及可能破坏产物、重复付费调用或让运行环境不安全的失败模式。同一事实只在其归属层测试一次；跨包装配使用一个已提交的完整图夹具，不在每个上层重复搭建半条视频链路。

不要为了让每个包看起来都有覆盖率而写测试，也不要重复比对 Manifest 数组、保留已经删除的预发布参数或数据库形态、把纯文档 UI helper 塞进系统测试。包锁和组件注册本身已经会拒绝 Manifest 与实现漂移。过时行为删除时，其测试也一起删除，不把测试集当作项目历史档案。

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

它们作为 `pnpm test` 的一部分，在每次提交时运行。

## 受环境开关控制的测试

| 命令 | 测试内容 | 前置条件 |
|---|---|---|
| `pnpm test:whisperx-service` | Python WhisperX 服务 | Python 3.13、uv、frozen sync |
| `pnpm test:image-opencv` | OpenCV 图像变换 | `SVML_OPENCV_TESTS=1`、`SVML_OPENCV_PYTHON` |
| `pnpm smoke:kie` | 实时付费的 KIE 生成 | `KIE_API_KEY` |

## 测试 fixtures

测试夹具放在 `packages/<name>/test/fixtures/`。它们是普通的 `.svml`、`.svs` 和 `.svrun` 文件，用于覆盖特定的编译路径。

`examples/` 目录同时充当集成级别的夹具：
- `examples/bootstrap/` — 最小源闭包检查
- `examples/talking-film-graph-check/` — 不含 Provider 的完整图编译
- `examples/talking-head-aroll/` — 显式复用历史 Candidate 的实时验收
