---
title: 测试
description: 测试运行器、测试模式与环境门控的测试。
---

# 测试

## 测试运行器

Hypit 使用 Node.js 内置的测试运行器（`node:test`），而不是 Jest、Vitest 或 Mocha。

```bash
pnpm test          # 包测试 + boundary 测试
```

测试文件位于 `packages/<name>/test/`，扩展名为 `.test.ts`。它们通过 glob `packages/*/test/**/*.test.ts` 被发现。

## 编写测试

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import { someFunction } from "@hypit/example";

test("someFunction returns the expected result", () => {
  assert.deepStrictEqual(someFunction(input), expected);
});
```

## 准入规则

默认测试集只保留三类测试：可观察合同、架构边界，以及可能破坏产物、重复付费调用或让运行环境不安全的失败模式。同一事实只在其归属层测试一次；跨包装配使用一个已提交的完整图夹具，不在每个上层重复搭建半条视频链路。

不要为了让每个包看起来都有覆盖率而写测试，也不要重复比对 Manifest 数组、保留已经删除的预发布参数或数据库形态、把纯文档 UI helper 塞进系统测试。组件注册本身会拒绝 Manifest 与实现漂移。过时行为删除时，其测试也一起删除，不把测试集当作项目历史档案。

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

### 架构边界

包边界由 package manifest、公开入口和共享合同表达；测试只验证边界上可观察的行为。
仓库不再把源码文本正则当作依赖分析或架构审查的替代品。

不得提交客户或品牌 fixture、凭据痕迹、付费产物、工作站绝对路径与一次性交付脚本。
通用 live test 只有在显式 opt-in、不提交秘密，并且未设置开关时能在花钱前退出的情况下才保留。

## 受环境开关控制的测试

| 命令 | 测试内容 | 前置条件 |
|---|---|---|
| `pnpm test:whisperx-service` | Python WhisperX 服务 | Python 3.13、uv、frozen sync |
| `pnpm test:image-opencv` | OpenCV 图像变换 | 服务自带的解释器，位于 `services/image-opencv/.venv`；要用别的解释器就设 `HYPIT_OPENCV_PYTHON` |
| `pnpm smoke:kie` | 实时付费的 KIE 生成 | `KIE_API_KEY` |

还有一个受浏览器开关控制的测试没有对应的 package script，直接用 Node 测试运行器跑：

```bash
HYPIT_BROWSER_TESTS=1 node --import tsx --test packages/provider-hyperframes-local/test/provider.test.ts
```

它会通过安装好的 HyperFrames CLI 渲染一段真实的无声 MP4，因此需要该 CLI 能启动的 Chrome 和 `ffmpeg`。不带
`HYPIT_BROWSER_TESTS=1` 跑同一个文件，这个测试会跳过，文件里其余测试照常执行——`pnpm test` 走的就是这条路径。

## 测试 fixtures

测试夹具放在 `packages/<name>/test/fixtures/`。它们是普通的 `.svml`、`.svs` 和 `.svrun` 文件，用于覆盖特定的编译路径。

`examples/` 目录同时充当集成级别的夹具：
- `examples/interview/`、`examples/podcast/`、`examples/ranking-football/` — 三个完整的视频示例，各自带有
  SVML、SVS、SVRun 源文件和配套素材。其中的子目录是彼此独立的变体，或是显式复用历史 Build 的项目。
- `examples/minimal-author-package/` — 包创作夹具，不是视频示例。它是一个最小但完整的组件包，连 Surface
  预览素材都齐备。
