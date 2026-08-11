---
title: 代码规范
description: 命名、模块边界、TypeScript 配置与 wire 数据。
---

# 代码规范

## 命名

| 项目 | 约定 | 示例 |
|---|---|---|
| 包目录 | kebab-case | `packages/speech-alignment/` |
| 包名 | `@narratage/` scope | `@narratage/speech-alignment` |
| Provider 包 | `provider-` 前缀 | `@narratage/provider-kie` |
| TypeScript 文件 | kebab-case | `align.ts` |
| 导出类型 | PascalCase | `SpeechAlignment` |
| 导出函数 | camelCase | `createSpeechAlignment` |

## 模块边界

- 每个包有且只有一个公开入口点：`src/index.ts`。
- 内部模块使用显式的 `.js` 扩展名（NodeNext 解析）。
- 跨包导入使用 `@narratage/*`，绝不跨包边界使用相对路径。
- 禁止生产依赖形成循环。

## TypeScript 配置

`tsconfig.json` 继承 `tsconfig.json`，并为所有 `@narratage/*` 包添加 `paths` 映射。

| 配置项 | 值 |
|---|---|
| Target | ES2023 |
| Module | NodeNext |
| Module resolution | NodeNext |
| `strict` | `true` |
| `noUncheckedIndexedAccess` | `true` — 索引访问返回 `T \| undefined` |
| `exactOptionalPropertyTypes` | `true` — `undefined` 必须显式写出 |

新增一个包时，要把它的路径映射加入 `tsconfig.json`：

```json
"@narratage/my-package": ["packages/my-package/src/index.ts"]
```

## wire 数据

- 所有持久化数据使用 `@1` wire 格式版本。
- 项目自有的 Module 与 Frontend 身份统一使用逻辑版本字面量 `1`。
- 工作区 `package.json` 在真正发布前保持 `0.0.0-dev`；它是物理包元数据，不是逻辑协议身份。
- 真正的可执行实现身份来自锁定后的包字节与闭包摘要，而不是以上任意一个版本字符串。
- wire 类型定义在 `@narratage/protocol` 中，且不可变。
- Nominal Type 由 Module 拥有，不在中心化的联合类型中注册。
- 类型 schema 使用与 JSON 兼容的结构，而不是 TypeScript 接口。

## 错误处理

- 编译失败时抛出带有描述性信息的错误，其中包含源码位置。
- 运行时失败在 Build 状态机中记录为 Operation 失败。
- 可恢复的失败会按照 Scheduler 的 lane 策略触发重试。
- 致命失败会让 Build 转入终止状态。
