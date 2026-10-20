---
title: 测试
description: 测试运行器、测试模式与环境门控的测试。
---

## 测试运行器

Hypit 使用 Node.js 内置的测试运行器（`node:test`），而不是 Jest、Vitest 或 Mocha。

```bash
pnpm test                                # 全部确定性的 owner、composition 与 workflow 测试
node test/run.mjs package kernel         # 选择一个 package owner
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

测试按所验证事实组织：

- `packages/<name>/test/behavior/` 归属包内不变量与状态转换；
- `packages/<name>/test/composition/` 验证一个直接包边界；
- `test/workflows/` 保存少量真实的跨包仓库流程；
- 浏览器、媒体、Python 和进程等环境行为通过显式命令运行。

runner 直接按路径选择，不维护标签、影响面数据库、依赖猜测或中央 suite 清单。完全依赖某个环境的测试物理放在其
owner 的 `test/environment/` 目录，并从默认与 `package` 选择中排除。混合文件先按事实拆分再迁移；纯 parser 或
request 检查不会仅因相邻测试使用浏览器就被重新分类。旧测试迁移期间，package test 根目录的平铺文件仍会被发现。

## 编写测试

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

## 准入规则

默认测试集只保留三类测试：可观察合同、架构边界，以及可能破坏产物、重复付费调用或让运行环境不安全的失败模式。同一事实只在其归属层测试一次；跨包装配使用一个已提交的完整图夹具，不在每个上层重复搭建半条视频链路。

不要为了让每个包看起来都有覆盖率而写测试，也不要重复比对 Manifest 数组、保留已经删除的预发布参数或数据库形态、把纯文档 UI helper 塞进系统测试。组件注册本身会拒绝 Manifest 与实现漂移。过时行为删除时，其测试也一起删除，不把测试集当作项目历史档案。

## 测试模式

### Owner behavior

在定义事实的 package 验证值、decoder、状态转换或构造器。只有当编译本身属于 owner 行为时，才编译 Author Source 或
Run Source。绝不调用外部服务。

```typescript
test("compiles the expected exports", async () => {
  const compiler = createCompiler({ root, packageContributions });
  const workspace = await compiler.openEntry("fixture.svml");
  const result = await compiler.compileResolvedSource(workspace.entry, workspace);
  assert.equal(result.exports.length, 3);
});
```

### Provider 测试

在可控的服务 fixture 上验证请求映射、媒体传输与任务推进，包括失败行为。
[项目 Provider 示例](https://github.com/hypit-ai/hypit/tree/main/examples/provider-package)
包含一个生命周期测试，会收集返回的图片且不产生生成费用。真实调用使用选定服务和明确的花费范围；仅有可用密钥并不构成授权。

### Boundary composition 与 workflow

包边界由 package manifest、公开入口和共享合同表达；测试只验证边界上可观察的行为。
Composition 测试只验证一次直接交接。Repository workflow 可以跨越多个包，但应从真实公开的 Source、Run 或 Result
输入开始，并断言用户可见结果，而不是用一个共享对象 fixture 重建每一层。
仓库不再把源码文本正则当作依赖分析或架构审查的替代品。

不得提交客户或品牌 fixture、凭据痕迹、付费产物、工作站绝对路径与一次性交付脚本。
通用的真实调用测试需要显式启用，不能提交密钥，且在未启用时不能产生费用。

## 受环境开关控制的测试

| 命令 | 测试内容 | 前置条件 |
|---|---|---|
| `node test/run.mjs environment browser-capture` | 浏览器捕获与 launcher 集成 | 选定的 Chrome；录制还需要 ffprobe |
| `node test/run.mjs environment caption-layout` | Fine Caption 的浏览器几何 | 选定的 Chrome |
| `node test/run.mjs environment cli-network` | OAuth 回环 callback 与超时生命周期 | 允许绑定本地回环端口 |
| `node test/run.mjs environment html-browser` | 本地 HTML 光栅化、浏览器获取、readiness 与进程行为 | 回环网络；选中相关测试时还需 Chrome、ffmpeg、ffprobe 与 `zip` |
| `node test/run.mjs environment studio-host` | Studio 回环 mutation 传输与真实文件监听 | 回环网络与宿主文件系统 watcher |
| `node test/run.mjs environment whisperx-local` | Local WhisperX Provider 传输与规范音频 staging | 允许绑定本地回环端口 |
| `node test/run.mjs environment runtime-process` | Local Runtime Worker、进程与可执行 CLI 生命周期 | 本地进程、signal 与平台凭据环境 |
| `node test/run.mjs environment runtime-scale` | Local Runtime 高并发执行 | 本地进程与 SQLite 环境 |
| `node test/run.mjs environment media-local` | Local Media Provider、CLI 媒体操作与精确媒体时序 | 可通过 `PATH` 使用 ffmpeg 与 ffprobe |
| `pnpm test:whisperx-service` | Python WhisperX 服务 | Python 3.13、uv、frozen sync |
| `pnpm test:image-opencv` | OpenCV Transform 与 Compose | Provider 自带的解释器，位于 `packages/provider-image-opencv-local/runtime/.venv`；要用别的解释器就设 `HYPIT_OPENCV_PYTHON` |

## 测试 fixtures

受版本控制的 `.svml`、`.svs` 或 `.svrun` fixture 应放在拥有其事实的 package behavior、boundary composition
或 repository workflow 附近。仓库不建立统一 fixture registry；fixture 也不得替无关测试暗中选择 Model、Provider、
公开 Output 或恢复规则。

Examples 是公开展示。只有 workflow runner 以稳定输入和明确断言实际执行它们时，它们才是测试 fixture；文件存在本身
不代表测试覆盖。
