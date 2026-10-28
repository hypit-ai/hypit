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
浏览器路径配置见[本地渲染器 README](packages/provider-html-local/README.md)。

## 进行改动

| 改动范围 | 文档 |
| --- | --- |
| 新增 Author 包 | [添加 Author 包](https://hypit.ai/zh/guide/author-packages/) |
| 新增 Provider | [添加 Provider](https://hypit.ai/zh/guide/providers/) |
| 组件内部 | [组件解剖](https://hypit.ai/zh/guide/component-anatomy/) |
| Studio 界面翻译 | [Studio 本地化](packages/studio/LOCALIZATION.md) |
| 编译、Run 与 Build | [Runtime](https://hypit.ai/zh/guide/runtime/) |
| 命名、模块边界、wire 数据 | [代码规范](https://hypit.ai/zh/guide/conventions/) |

中英文档分别位于 `docs/` 和 `docs/zh/`，改动一侧的页面时，请一并改动对应的另一侧。

## 自查

包含代码改动的 Pull Request 会通过 CI 运行下面这些命令，提交前先在本地跑一遍：

```bash
pnpm check         # TypeScript 类型检查
pnpm test          # 包与服务适配器测试
```

Hypit 按事实归属组织测试，不使用含义模糊的 unit/integration/e2e 金字塔：

- `packages/<name>/test/` 验证 package 自己拥有的值与行为；
- `packages/<name>/test/composition/` 验证一次直接交接；
- `test/workflows/` 只验证少量完整公共流程；
- `packages/<name>/test/environment/` 中的文件只通过显式的
  `node test/run.mjs environment <name>` 运行。

修改单个 package 时可运行 `node test/run.mjs package <name>`；仓库流程使用
`node test/run.mjs workflow <name>`。默认 `pnpm test` 不包含依赖浏览器、媒体工具、Python
或真实进程环境的行为。

新增测试前，应先说明可观察事实、事实 owner，以及哪个失败无法被现有测试发现。完整不变量只在 owner
处验证；消费方只验证自己使用的关系。不要复述 Manifest 数组、内部状态对象或偶然调用顺序。Fixture
可以减少语法，但不能替调用者选择 Model、Provider、Output、恢复规则或领域关系。行为被删除时，其测试
也一起删除，不把测试集当作项目历史档案。

## 打包 Distribution

### 0.3.1 的 SDK 导入迁移

已有视频项目的准确导入映射、依赖调整与验证方法见
[Agent 迁移指南](migrations/0.3.1.md)。从 0.2.x 或更早开发版本迁移的项目，先阅读
[0.3 项目迁移指南](migrations/0.3.md)。

视频领域 SDK 改为独立安装的包。组件代码使用 `@hypit/hypit/composition` 等旧根子路径时，
需要改为从 `@hypit/composition` 导入，并在组件自己的 `dependencies` 中声明该包。
Timeline、Temporal、Spatial、Media、Narrative、Caption、Generation、HTML Program、证据与
投影包同理。使用子路径 API 时，以所属包实际导出为准，例如 `@hypit/temporal/author`、
`@hypit/temporal/studio`。通用宿主 API 继续由 `@hypit/hypit/*` 提供。
SVML 的逻辑 Module 引用仍保持 `@1`，这里改变的是 npm 归属和 TypeScript 导入路径。

根发行号定为 `0.3.1`，但上述 SDK 导入迁移与 `0.3.0` 并非源码兼容。
需要一起更新根和受影响的组件依赖，然后由项目的普通包管理器更新 lockfile。
已有领域包的新架构版本使用 `0.2.x`，避免旧 `^0.1.1` 依赖静默选择它们；
原先内嵌的领域包从 `0.1.0` 开始，未变化的包保留原版本。

### 构建与发布

运行 `npm run pack:distribution`，构建公共类型并将发布 tarball 写入 `dist/release/`。
脚本在临时目录中使用 npm 选定的文件，从英文 README 生成 npm 页面版本：使用公开图片地址，
保留两个 GIF，并将完整视频示例改为链接。仓库的两份 README 保持原样。
`dist/release/README.md` 可用于检查打包后的文案。

准备好 FFmpeg 和 FFprobe 后，运行
`npm run check:distribution -- dist/release/hypit-hypit-<version>.tgz`。它在仓库外安装该包，
编译包内的聊天示例组件，准备字体和本地渲染器，渲染、导出并解码视频。检查使用独立的
Hypit 状态目录，关闭 Puppeteer 隐式下载，先验证缺少浏览器的诊断，再在独立缓存中
显式准备浏览器。结束时停止自己的 Runtime Worker，失败时保留临时项目。
可通过 `npm_config_cache` 复用已下载的包；验证项目、node_modules、Runtime 状态和浏览器安装
仍保持独立。CI 在源码检查之外并行调用 `npm package execution`，保留测试过的候选制品。

正式发布时，将预定版本提交到 `main`，等待 **CI** 成功。它并行进行源码检查与候选打包，再在
Linux 和 Windows 上安装、执行同一份候选。PR 使用相同检查，但其制品不能用于正式发布。
纯文档改动不自动触发 CI；如果要发布这种提交，在 `main` 上手动运行 **Actions → CI → Run workflow**。
一次成功的 CI 提供后续发布使用的 `npm-package` 制品。

在这个准确提交上创建标签 `v<version>` 并发布 GitHub Release。**Publish npm** 查找该提交成功的
main CI，下载其制品，核对版本和 npm 状态，按依赖优先、根包最后的顺序发布，再附上根包 tarball。
发布不重新编译、安装或渲染。标签提交必须包含这套工作流；此路径只支持稳定版。

手动发布或更新独立包时，在 `main` 上打开 **Actions → Publish npm → Run workflow**，填写成功的
**CI run ID**。不勾选 **Publish** 时只下载、检查候选，不写 npm；勾选后才发布。即使 main 后来
继续前进，run ID 仍选择原来测试过的文件。**packages** 输入填写空格分隔的准确包名，例如
`@hypit/studio`；留空表示完整候选。现有根依赖范围仍适用时，独立包更新不需要发布根包。
本地对应命令是 `node scripts/publish-release-candidate.mjs dist/release/release-plan.json --package=@hypit/studio`。

发布或附件上传失败时，用同一个候选重跑发布，不重跑 CI。已存在且内容一致的 npm 版本会跳过，
已有 Release 附件保留。发布工具修复可以提交到 main，再选择原来的 CI run ID。制品过期或丢失时，
才显式重跑 CI。检查或 npm 预检失败不消耗版本；一个包的版本进入 npm 后，更改该包内容才需要新版本，
重试原内容的发布不需要。push main、只 push 标签或保存草稿 Release 都不会发布 npm。
对外宣布版本可用前，先核对发布结果。

发行依赖使用明确的兼容范围，例如 `workspace:^0.3.0`；打包只去掉 workspace 前缀，
不会自动把兼容下限抬高到当前源码版本。

npm 包的 Trusted Publisher 应配置 GitHub Actions：组织 `hypit-ai`、仓库 `hypit`、工作流
`publish-npm.yml`，允许直接 `npm publish`，环境名称留空。发布 job 使用 OIDC，不需要保存 npm Token。
已发布的版本不能覆盖；`0.1.2` 等 npm 版本与逻辑接口 `@1` 分开管理。

新独立包首次进入发行时，下载成功 CI 的候选，执行 `npm login`，再创建该包并绑定可信发布：

```sh
gh run download <ci-run-id> --name npm-package --dir <candidate-directory>
node scripts/publish-release-candidate.mjs <candidate-directory>/release-plan.json --package=@hypit/new-package
npm exec --yes --package=npm@^11.15.0 -- node scripts/configure-release-publishers.mjs <candidate-directory>/release-plan.json --package=@hypit/new-package
```

首次发包只选择新包，不选择根包。可信发布配置由 npm 11.15 或更新版本完成，可能需要浏览器授权。
绑定完成后，普通发布仍由 GitHub OIDC 执行，无需保存长期 npm Token。

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
