# Hypit 仓库协作准则

## 当前协作方式

按用户当前确认的范围推进，不把文档中的一般原则或后续设想自动展开为当前任务。

HypiHub 在独立仓库维护。审查外部改动时，先理解它解决的实际问题，再按本页原则核对实现与边界；提交来源不代替技术判断。

## 不可违背的项目原则

- 从实际视频制作需求出发，保持领域 Core 无关和边界可插拔。
- 严禁无意义的哈希、摘要、smoke、canary、门禁、契约、SHA-256、国防式测试和过度一致性测量。
- 不为历史恢复、反向寻址或兼容猜测建立中央元数据、中央状态表或自动兜底。
- 不把 Runtime、Provider、Endpoint、Result Repository 或文件系统实现硬编码进领域模型。
- 用户的现有改动优先；未经明确要求不推送远程、不创建 PR、不恢复已经淘汰的旧技术路线。

## 已确认的用户时代假设

Hypit 的用户通常也是组件作者。新视频经常需要新的视觉角色、结构或语义；在 Agent 能快速完成组件实现的今天，创建项目组件是正常的视频制作流程，不是框架开发的例外情况。

边界是：

- 写一个新组件是在做视频。
- 改变组件如何被写、加载、执行或兼容，才是在开发 Hypit。

正常使用包括 `.svml`、`.svs`、`.svrun`、assets、runtime profiles、Results，以及项目内 `packages/` 中组件自己的 TypeScript、Manifest、Surface、Producer、Fragment 和 preview。通过现有公共接口编写并显式选择项目 Model 或 Provider，也属于包扩展。框架开发是改变这些公共接口、Core、Compiler、Runtime、Result、CLI、Studio、Package Loader 或共享协议的行为。

不要把“只有证明现有 Surface 完全无法表达后才能创建组件”设成审批流程。应先了解和复用已有能力，但遇到真正新的视觉角色、结构或语义时，可以直接创建项目组件。

## 文档的三种职责

### 公共展示与用户说明

公共展示面包括：

- 根目录 `README.md`、`README.zh-CN.md`；
- `docs/public/` 的展示资源；
- `docs/` 下参与 VitePress 站点的所有 Markdown，包括 quickstart、guide 和中文内容。

公开站点说明已经成立的产品能力与用法，不承载包清单、内部状态机、阶段性审计或当前实现快照。

### 视频制作与组件创作知识

`skills/hypit/` 面向实际制作，负责：

- 编写和修改 Sources、Recipes、Runs；
- 素材、运行配置、Result 和输出复用；
- 在项目内创建、预览和使用 Author Package / 组件；
- 在确有跨项目复用需求时，准备独立组件包。

Skill 不应指导修改 Hypit 框架，也不应依赖公共开发指南作为权威来源。

### Hypit 框架开发知识

仓库级 Agent 文档负责跨包原则、框架边界和维护规则。精确 API、脚本及局部约束优先留在对应 package/service README 或代码附近，不复制成容易过期的中央百科。

`CONTRIBUTING.md`、examples README、package/service README 虽公开可见，但属于贡献入口或局部技术事实，不属于产品展示门面。

## 已确认的组件分发模型

1. 新组件默认存在于视频项目的 `packages/`，与项目一起版本管理。
2. 只有所有者明确需要跨项目共享时，才整理成独立 npm 包，由所有者自己的 scope 和 npm/private registry 承载。
3. 项目通过普通 `package.json` 和包管理器 lockfile 固定实际安装版本；构建期间绝不自动升级。
4. Source 使用包名和逻辑 Module ABI 引用组件；包管理器负责物理实现版本。Hypit 不再发明一套版本系统。
5. Runtime 遇到未安装的包时只给出准确的缺失提示，不自动下载和执行陌生代码。
6. 只有极少数经过明确产品决策的基础能力才可能进入 Hypit 官方发行；这不是普通项目组件获得复用的路线。

稳定分发默认使用不可覆盖的版本化包，而不是直接修改安装目录中的 Git checkout。`file:`、tarball 或 Git 依赖可以作为开发手段，但不是稳定发布默认值。

不要建立 Hypit Registry、组件数据库、自动扫描/安装机制或 Hypit 专用 package lock。不要把项目组件“提升进 Hypit 主仓库”作为默认流程，也不要为一次视频修改已经安装的官方包。

## 文档维护

Skill 入口保留受托导演的判断方式、长期责任和按当前问题读取的路由。Creation 负责参考理解与目标设计，Production 负责系统使用与组件创作，Environment 负责安装和执行环境；Format 解释整片关系，Craft 解释局部创作判断，Prompt Kit 由所属包维护准确模板。

共享 Skill 与 Kit 文案使用英语；Agent 与用户交流时使用用户的语言。具体作品的事实与决定留在项目文档、Source、Run 和 Result 中。

框架的跨包原则留在本页，准确接口与局部实现留在 package/service README 和代码附近。临时审计完成后，把仍有用的事实并入其所有者，再删除审计材料。文档围绕问题、设计理由和用法展开，技术判断独立于贡献者身份。
