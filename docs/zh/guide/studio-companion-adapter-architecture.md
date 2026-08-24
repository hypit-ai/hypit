---
title: Studio Companion Adapter 目标架构
description: 领域组件、Studio 适配包与 Studio 应用之间的三层边界、选择机制和迁移约束。
---

# Studio Companion Adapter 目标架构

> 状态：已确认的目标架构，尚未实施。本文固定职责边界和验收原则，不把当前中央适配包描述成目标，也不提前锁死包管理命令、最终 ABI 字段名或迁移批次。

## 决策

一个领域模块与 Hypit Studio 的关系必须拆成三层：

```text
领域组件包                  Hypit Studio Companion             Studio 应用
@scope/example-track   <-   @scope/example-track-studio   ->   @hypit/studio
```

- 领域组件包定义“它是什么、怎样运行和渲染”；
- 独立 Companion 定义“它在 Hypit Studio 中怎样被理解和编辑”；
- Studio 定义“一个适配包可以使用哪些统一外观、控件和操作”。

领域组件包不得为了支持 Hypit Studio 而承担编辑器语义。Hypit Studio 也不得把多个无关领域模块的解释集中实现。其他 Studio 可以为同一个领域组件提供自己的 Companion，而不修改组件。

推荐一个领域模块对应一个 Hypit Studio Companion，而不是一个 Surface 标签对应一个包。例如 Ranking 的 Column、Tier 和 Top Three 同属一个领域模块，可以由一个 `ranking-studio` Companion 适配。`<module>-studio` 只是推荐命名，不是自动发现约定。

## 三层所有权

### 领域组件包

领域组件包拥有：

- Module Manifest、名义 Type 和 Producer；
- SVML Surface 与 SVS Recipe；
- Program、Schedule、Track 等公共领域值；
- 确定性执行、校验、lowering 和渲染；
- 对其他消费者同样成立的稳定身份、时间和素材关系。

领域组件包不得：

- 依赖 `@hypit/studio` 或 `@hypit/studio-adapter`；
- 声明 Studio lane、颜色、图标、Inspector 页面或编辑手势；
- 添加只为 Studio 服务的 `studioLabel`、`studioGroup` 等领域字段；
- 知道某个 Studio 是否安装、怎样布局或怎样写回。

如果 Companion 无法从公共领域值理解一个实体，优先补充领域上本来就存在的公共 Program、Schedule 或身份映射。不得让 Companion 导入组件私有实现，也不得为了编辑器方便污染领域协议。

### Hypit Studio Companion

Companion 是独立安装、独立选择的适配包。它面向一个领域模块和一个 Studio ABI，拥有：

- Track、Surface、输出 Type 的精确匹配；
- 公共 Program/Schedule 到 Studio entity 的投影；
- entity 的稳定身份、标题、正文、时间、预览和父子关系；
- root lane、附属 lane、Inspector 信息架构和参数 allowlist；
- 可用时间线手势、参数操作及其禁用原因；
- 领域对象与执行时间谱系之间的显式连接。

Companion 只能返回 Studio ABI 定义的数据，不得：

- 注入 DOM、CSS、前端脚本或私有页面；
- 直接写文件、调用 Provider、创建 Build 或维护自己的状态库；
- 根据 renderer id 前缀、字符串包含关系、相同帧区间或属性名猜领域语义；
- 绕过 Studio 的 revision、事务、校验和 Source range 写回机制。

Companion 与领域组件的兼容范围应由普通包版本关系表达。组件本身不反向依赖某个可执行 Adapter；是否采用该 Companion 是 Studio 分发或项目的选择。

### Studio 应用与 ABI

Studio 提供受控的编辑器语言，而不是领域组件目录。它拥有：

- session、preflight、snapshot、播放、seek、缩放、滚动和选择；
- Source、Tasks、Artifacts 与 Preview；
- Adapter 选择、身份限定、冲突检测和显式 replacement；
- Source revision、最小修改、失败回退和重新编译；
- 通用终端 Track 兜底和 Semantic 时间标尺；
- 统一外观、Inspector 控件和操作执行器。

Studio ABI 应提供有限、稳定、可组合的外观全集：

- 内容形状，例如 picture、text、waveform、block、group；
- 视觉 tone 与图标 token；
- lane、附属 lane、标题/正文和素材预览；
- Inspector 大类、可选子页、参数组和标准控件；
- select、seek、move、trim、canvas transform 等交互能力；
- `timeline.adjust`、`parameter.adjust` 等标准作者操作。

语义 family 与视觉 tone 必须分离。新 Companion 可以声明新的领域 family，但只能选择 Studio 提供的视觉 token，不能依靠 `.track-caption`、`.track-ranking` 一类组件名 CSS 获得外观。

外观全集的精确字段和 token 可以随 ABI 设计继续收敛；不变的是 Studio 控制渲染语法、Companion 只作声明。

## 选择与安装

Adapter 选择必须显式，不使用包名猜测或目录扫描：

- 官方 Hypit Studio Distribution 显式选择它支持的官方 Companion；
- 项目可以通过可选 Studio Profile 选择项目 Companion 或 replacement；
- 其他 Studio Distribution 可以选择完全不同的 Companion；
- Studio 不扫描 `node_modules`，不看到 `@scope/example-track` 就猜测存在 `@scope/example-track-studio`；
- 打开 Studio 不联网搜索、静默安装或升级 Adapter。

官方 Distribution 中的选择清单只表示“这个应用信任并支持哪些 Companion”，不得包含组件的实体投影、参数表或领域判断。普通用户无需为每个项目重复安装已经存在于机器级 Studio Distribution 中的 Companion。

项目 Profile 是可选的编辑器能力选择，不是 Hypit 项目清单，也不规定 SVML、SVS、SVRun 或素材的目录结构。不得为 Adapter 再发明运行锁、摘要、哈希索引或第二份包管理数据库；安装与版本关系由现有包管理和 Distribution 负责。

## 缺少 Companion 时

领域组件的运行不依赖 Studio Companion。删除 Studio 或删除 Companion 后，SVML、SVS、SVRun、CLI、Runtime 和渲染必须继续工作。

Studio 没有找到专用 Companion 时：

- 标准 `VisualTrack` / `AudioTrack` 可以使用不识别模块名的通用兜底；
- 界面不得猜它是 Caption、Ranking、Media 或其他领域对象；
- 没有声明的 item 拆分、参数和操作保持不可用；
- 需要丰富编辑能力时，明确说明缺少显式选择的适配包。

通用兜底属于 Studio 基建。它可以理解跨领域稳定的终端协议，但不得出现官方组件模块名、Surface 名或参数全集。

## 数据投影原则

Companion 必须消费组件公开的领域真相，而不是反向解析最终画面。典型链路是：

```text
Author Source
  -> 公共 Program / Schedule / Temporal projection
  -> Companion 投影 Studio entity
  -> Studio 统一显示和执行操作
```

Caption 的目标链路例如：

```text
Script 中的 ||
  -> CaptionDocument + FineCaptionSchedule
  -> caption-fine-studio 根据 Cue unitIds 读取真实 display words
  -> 一个 Cue 对应一个 Studio item
```

Cue 正文不应从 VisualIR 的 `data-caption-word` 抓取，身份也不应由 `caption-program:cue:*` 的字符串格式反推。类似地：

- Ranking Companion 应消费公开 Ranking Schedule 和素材关系；
- Media、Audio、Typography Companion 应消费各自公开 Program；
- Speech Companion 应消费显式 Segment 到终端 Track 的对应关系，不用相同帧区间认领 Segment；
- Deck Companion 应消费显式 Card 到 Present 的对应关系，不用 renderer id 前缀匹配。

这些公共值不是 Studio metadata；任何诊断工具、另一种 Studio 或批量系统都可以消费它们。

## 操作边界

Companion 声明操作，Studio 执行操作：

```text
Companion
  -> entity 支持哪些 gesture
  -> gesture 对应哪些真实 Source 参数或 Semantic Anchor
  -> 当前是否 enabled，为什么 disabled

Studio
  -> 输入手势、吸附与坐标换算
  -> revision 校验
  -> 最小 Source 修改
  -> 重新编译、成功发布或失败回退
```

Companion 不获得文件写权限。没有唯一可逆 Source 映射的操作必须禁用，不能只因为画面上看起来可拖就生成写回。

## 当前实现偏差

当前实现尚未符合本文：

- `@hypit/studio-video-adapters` 集中实现 Speech、Media、Audio、Typography、Caption、Ranking、Deck 等无关模块；
- Studio 固定加载这个中央包，再叠加项目 Profile；
- `generic` Adapter 为多个组件维护一个巨大的可能参数全集；
- Studio CSS 把领域 family 名直接当视觉主题；
- 部分 Adapter 仍从 renderer id、VisualIR attribute 或相同帧区间恢复领域身份。

这些都是待迁移的当前事实，不是稳定目标。当前中央包不能因为物理上位于 `packages/studio` 之外，就被视为已经去中心化。

目标中的官方 Companion 至少包括：

- `caption-fine-studio`；
- `typography-track-studio`；
- `media-track-studio`；
- `audio-track-studio`；
- `speech-track-studio`；
- `ranking-studio`；
- `deck-track-studio`；
- `comment-sticker-studio`；
- `screen-overlay-studio`。

精确 npm 名称在实施时决定；列表表达的是所有权拆分，不是要求 Studio 根据后缀自动发现。

## 历史偏差

2026 年 8 月 20 日的 `74f976ab` 在新 Studio 落地时采用了 centralized video-domain policy。2026 年 8 月 23 日的 `36fa9ab0` 同时引入正确的 Companion ABI、项目 Profile 和错误的官方中央适配包：项目组件被要求使用独立 Companion，官方组件却被整体搬进一个总包。后续文档按当前代码描述包边界，使这个不对称看起来成为稳定设计。

本文恢复并固定原始原则：外部项目与官方组件遵循同一条 Companion 边界。把代码移出 `packages/studio` 只叫物理分离；只有每个领域模块的 Studio 解释由独立 Companion 拥有，才叫职责分离。

## 验收原则

未来实施完成时必须同时满足：

1. 领域组件包的依赖和源码中不存在 Studio ABI 或 UI 语义；
2. 一个官方 Companion 不适配多个互不相关的领域模块；
3. Studio 核心与通用兜底不枚举官方组件名、Surface 名或组件参数；
4. Companion 只使用公共 Program、Schedule、身份与时间谱系；
5. Adapter 包通过显式 Distribution/Profile 选择，不扫描、不猜名、不静默安装；
6. 删除 Companion 只损失丰富编辑能力，不影响检查、构建、复用和渲染；
7. 删除 Studio 不影响领域组件及其用户项目；
8. 另一个 Studio 可以为同一组件发布另一套 Adapter，无需 fork 组件；
9. Studio 的统一写回、失败处理和防抖不下沉到 Companion；
10. 不为迁移增加自造 lock、哈希、摘要、缓存数据库或固定项目目录结构。

## 非目标

本文不决定：

- 是否以及何时发布这些 npm 包；
- 最终包名和版本号；
- 每个 ABI token 的精确字面量；
- 一次迁完还是按模块分批迁移；
- 为其他 Studio 设计通用行业标准；
- 让 Hypit Studio 成为完备 NLE。

这些实施选择可以调整，但不得重新合并三层所有权。
