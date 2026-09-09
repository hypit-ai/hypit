---
title: 代码规范
description: 命名、模块边界、TypeScript 配置与 wire 数据。
---

# 代码规范

这些规范面向 Hypit 仓库内的工作。项目扩展使用所有者自己的 scope 和公开的 `@hypit/hypit/*` SDK 子路径，见 [包与扩展](./packages.md)。

## 命名

| 项目 | 约定 | 示例 |
|---|---|---|
| 包目录 | kebab-case | `packages/speech-alignment/` |
| 包名 | `@hypit/` scope | `@hypit/speech-alignment` |
| Provider 包 | `provider-` 前缀 | `@hypit/provider-kie` |
| TypeScript 文件 | kebab-case | `align.ts` |
| 导出类型 | PascalCase | `SpeechAlignment` |
| 导出函数 | camelCase | `createSpeechAlignment` |

## 模块边界

- 包通过 `package.json` 的 exports 声明公开入口；`src/index.ts` 是常见的工作区入口。
- 内部模块使用显式的 `.js` 扩展名（NodeNext 解析）。
- 跨包导入使用 `@hypit/*`，绝不跨包边界使用相对路径。
- 禁止生产依赖形成循环。

## TypeScript 配置

根 `tsconfig.json` 通过普通 pnpm 工作区链接检查全部包，不维护中央 `paths` 注册表。每个包必须在自己的
`dependencies` 或 `devDependencies` 中声明所有跨包导入。

| 配置项 | 值 |
|---|---|
| Target | ES2023 |
| Module | NodeNext |
| Module resolution | NodeNext |
| `strict` | `true` |
| `noUncheckedIndexedAccess` | `true` — 索引访问返回 `T \| undefined` |
| `exactOptionalPropertyTypes` | `true` — `undefined` 必须显式写出 |

新增包不需要修改根 TypeScript 配置。

## wire 数据

- 所有持久化数据使用 `@1` wire 格式版本。
- 项目自有的 Module 与 Frontend 身份统一使用逻辑版本字面量 `1`。
- 包版本通过 npm 或 pnpm 选择物理发行，与逻辑 Module 和 Frontend 接口版本分别表达。
- 包管理器和 lockfile 负责固定安装版本及其依赖。
- wire 类型定义在 `@hypit/protocol` 中，且不可变。
- Nominal Type 由 Module 拥有，不在中心化的联合类型中注册。
- 类型 schema 使用与 JSON 兼容的结构，而不是 TypeScript 接口。

## 错误处理

- 编译失败时抛出带有描述性信息的错误，其中包含源码位置。
- 运行时失败在 Build 状态机中记录为 Operation 失败。
- 服务协议允许的有限传输重试由 Provider 负责。
- 执行尝试失败会结束 Build；后续工作使用新的 Run 与 Build，显式选择已完成 Output 复用。
