# 为 Hypit 做贡献

[English](./CONTRIBUTING.md)

欢迎提交 Pull Request。文档、示例和翻译与代码同样重要。

视频组件通常保存在视频项目自己的 `packages/` 目录中。需要跨项目共享时，由所有者通过自己的 npm scope 或私有 registry 发布，再由各项目的包管理器安装版本化发行包。希望将能力纳入官方发行时，可以通过 issue 说明它解决的共同制作需求。

## 开始之前

可以认领一个[已有的 issue](https://github.com/hypit-ai/hypit/issues)，也可以新开一个说明你想做的事。凡是会改动协议类型、包边界或 Provider 契约的改动，请先在 issue 里说明思路。

## 环境准备

需要 Node.js 22.15+ 和 pnpm 10.33，版本由根目录的 `packageManager` 字段指定。

```bash
corepack enable
pnpm install --frozen-lockfile
```

运行真实 Build 还需要 Python 3.10–3.13、uv、ffmpeg 和 Chromium，各自的用途见[开发指南](https://hypit.ai/zh/guide/develop/)。

使用本地渲染的 Profile，首次渲染前执行
`hypit programs up --runtime <profile> --endpoint <render-instance>`；也可以执行
`hypit runtime up --runtime <profile>`，准备整个 Profile 并启动 Worker。
这一步显式准备 Chrome，不依赖 pnpm 放行依赖安装脚本。
`hypit doctor --runtime <profile>` 只诊断，不安装。
浏览器路径配置见[本地渲染器 README](packages/provider-hyperframes-local/README.md)。

## 进行改动

| 改动范围 | 文档 |
| --- | --- |
| 新增 Author 包 | [添加 Author 包](https://hypit.ai/zh/guide/author-packages/) |
| 新增 Provider | [添加 Provider](https://hypit.ai/zh/guide/providers/) |
| 组件内部 | [组件解剖](https://hypit.ai/zh/guide/component-anatomy/) |
| Studio 界面翻译 | [Studio 本地化](packages/studio/LOCALIZATION.md) |
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

## 报告渲染问题

对于渲染问题，提交报告前应尽量做到可复现，并避免在没有证据时直接判断根因。建议包含：

1. **环境**：操作系统、Hypit CLI 版本、渲染 Provider、浏览器/渲染器版本（如果可获得）、分辨率、fps，以及使用本地还是外部 Provider。
2. **最小复现**：仍然能够触发问题的最小 composition，以及生成它所需的命令或 build。
3. **对照变体**：保留文本图不变，只移除一个可疑子系统（例如 picture 或 audio），用于确认触发条件。
4. **时间证据**：受影响元素的 authored 和 compiled span，并说明是否存在时间重叠。
5. **输出证据**：受影响的 frame 或时间点；如果是视觉问题，最好给出与干净对照结果的简短测量或比较。
6. **隔离结果**：列出已经验证过的变体和已排除的假设，避免维护者重复相同的排查。

如果源文本或素材敏感，可以替换为中性占位内容，但应保持会触发问题的结构、时间、样式和子系统不变。在确认 source graph 和对照变体之前，不要直接断言问题一定来自 renderer。

## 打包 Distribution

运行 `npm run pack:distribution`，构建公共类型并将发布 tarball 写入 `dist/release/`。
脚本在临时目录中使用 npm 选定的文件，从英文 README 生成 npm 页面版本：使用公开图片地址，
保留两个 GIF，并将完整视频示例改为链接。仓库的两份 README 保持原样。
`dist/release/README.md` 可用于检查打包后的文案。

准备好 FFmpeg 和 FFprobe 后，运行
`npm run check:distribution -- dist/release/hypit-hypit-<version>.tgz`。它在仓库外安装该包，
编译包内的聊天示例组件，准备字体和本地渲染器，渲染、导出并解码视频。检查使用独立的
Hypit 状态目录，关闭 Puppeteer 隐式下载，先验证缺少浏览器的诊断，再在独立缓存中
显式准备浏览器。结束时停止自己的 Runtime Worker，失败时保留临时项目。
`npm package execution` 工作流在 PR 上执行这项检查，发布流程复用它；发布的就是已经
安装并执行过的同一份 tarball。

正式发布请走现有的 GitHub Release 工作流。把下一个稳定 npm 版本写入 `package.json` 并提交到
`main`。打开 **Releases → Draft a new release**，选择该提交，打上标签 `v<version>`（例如
`v0.1.8`），写好发布说明后发布 Release。带标签的提交必须包含此工作流。
`Publish npm` 会核对标签与版本一致、且该提交属于 main 的历史，运行 Linux/Windows 检查，
构建并检查打包后的 CLI，再以 `latest` 发布到 npm，并把 tarball 附加到这次 Release。
检查与打包使用触发时的提交，即使随后 main 继续前进。此路径只支持稳定版，不支持预发布。

**Actions → Publish npm → Run workflow** 在 `main` 上仍然可用：填写已提交的版本，不勾选
**Publish to npm** 时只运行 Linux/Windows 检查并提供可下载的 README 与 tarball；勾选后，
在检查通过后把本次打出的 tarball 发布为 `latest`。补完一次失败的 Release 发布时，先修好
外部问题再重跑该 Release 的工作流。若必须改代码，准备新版本和新的 Release。已经发布的
npm 版本会被跳过且不改动 `latest`；已经附在 Release 上的文件会保留。
push main、只 push 标签、或保存草稿 Release 都不会发布 npm。工作流不修改版本，也不创建标签。
可见的 Release 可以早于 npm 发布成功；对外宣布该 npm 版本可用前，先看这次 Actions 的结果。

npm 包的 Trusted Publisher 应配置 GitHub Actions：组织 `hypit-ai`、仓库 `hypit`、工作流
`publish-npm.yml`，允许直接 `npm publish`，环境名称留空。发布 job 使用 OIDC，不需要保存 npm Token。
已发布的版本不能覆盖；`0.1.2` 等 npm 版本与逻辑接口 `@1` 分开管理。

发布说明应写明变化的用户行为，以及受影响的安装。npm Distribution 与已安装的 Skill 分开更新：
一次发布若两者都变，请同时链到相关 Skill 变更并说明两条更新路径。已保存的视频项目及其现有素材
独立于这两种安装。发布后，先核对工作流结果和 npm 上的已发布版本，再告诉用户更新可用。

## 提交 Pull Request

分支名与提交信息使用同一套前缀：分支用 `feat/`、`fix/`、`docs/`，提交信息用 `feat:`、`fix:`、`docs:`。

## Issue 与 PR 分析

维护者可在 Actions 的 **Repository analysis** 工作流中指定 Issue 或 PR，请求 AI 初步分析。
建议只显示在该次运行的报告里，Issue 与 PR 的管理仍由维护者操作。
输入与分析范围详见[维护指南](.github/ISSUE_AUTOMATION_DESIGN.md)。

## 获取帮助

在 [Discord](https://discord.gg/85hnyQnxpn) 或 [Telegram](https://t.me/hypitai) 提问。
