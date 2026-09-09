# 为 Hypit 做贡献

[English](./CONTRIBUTING.md)

欢迎提交 Pull Request。文档、示例和翻译与代码同样重要。

视频组件通常保存在视频项目自己的 `packages/` 目录中。需要跨项目共享时，由所有者通过自己的 npm scope 或私有 registry 发布，再由各项目的包管理器安装版本化发行包。希望将能力纳入官方发行时，可以通过 issue 说明它解决的共同制作需求。

## 开始之前

可以认领一个[已有的 issue](https://github.com/hypit-ai/hypit/issues)，也可以新开一个说明你想做的事。凡是会改动协议类型、包边界或 Provider 契约的改动，请先在 issue 里说明思路。

## 环境准备

需要 Node.js 22.12+ 和 pnpm 10.33，版本由根目录的 `packageManager` 字段指定。

```bash
corepack enable
pnpm install --frozen-lockfile
```

运行真实 Build 还需要 Python 3.10–3.13、uv、ffmpeg 和 Chromium，各自的用途见[开发指南](https://hypit.ai/zh/guide/develop/)。

## 进行改动

| 改动范围 | 文档 |
| --- | --- |
| 新增 Author 包 | [添加 Author 包](https://hypit.ai/zh/guide/author-packages/) |
| 新增 Provider | [添加 Provider](https://hypit.ai/zh/guide/providers/) |
| 编译、Run 与 Build | [Runtime](https://hypit.ai/zh/guide/runtime/) |
| 命名、模块边界、wire 数据 | [代码规范](https://hypit.ai/zh/guide/conventions/) |
| 测试与依赖环境的测试套件 | [测试](https://hypit.ai/zh/guide/testing/) |

中英文档分别位于 `docs/` 和 `docs/zh/`，改动一侧的页面时，请一并改动对应的另一侧。

## 自查

每个 Pull Request 的 CI 都会运行下面这些命令，提交前先在本地跑一遍：

```bash
pnpm check         # TypeScript 类型检查
pnpm test          # 包与服务适配器测试
```

## 打包 Distribution

运行 `npm run pack:distribution`，构建公共类型并将发布 tarball 写入 `dist/release/`。
脚本在临时目录中使用 npm 选定的文件，从英文 README 生成 npm 页面版本：使用公开图片地址，
保留两个 GIF，并将完整视频示例改为链接。仓库的两份 README 保持原样。
`dist/release/README.md` 可用于检查打包后的文案。
使用 `npm publish dist/release/hypit-hypit-<version>.tgz --access public` 发布生成的 tarball。

## 提交 Pull Request

分支名与提交信息使用同一套前缀：分支用 `feat/`、`fix/`、`docs/`，提交信息用 `feat:`、`fix:`、`docs:`。

## 获取帮助

在 [Discord](https://discord.gg/85hnyQnxpn) 或 [Telegram](https://t.me/hypit) 提问。
