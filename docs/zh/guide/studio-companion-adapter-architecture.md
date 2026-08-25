---
title: Studio Companion 架构
description: 领域组件、Studio Companion 与 Studio 应用之间的三层边界、显式选择机制和实现约束。
---

# Studio Companion 架构

> 状态：已实施。本文记录当前稳定的职责边界、显式选择方式与验收原则；具体 Inspector token 和操作能力仍可在 ABI 内继续演进。

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
- entity 的稳定身份、标题、正文层、素材层、时间几何和父子关系；
- root lane、附属 lane、Inspector 信息架构和参数 allowlist；
- 可用时间线手势、参数操作及其禁用原因；
- 领域对象与执行时间谱系之间的显式连接。

Companion 只能返回 Studio ABI 定义的数据，不得：

- 注入 DOM、CSS、前端脚本或私有页面；
- 直接写文件、调用 Provider、创建 Build 或维护自己的状态库；
- 根据 renderer id 前缀、字符串包含关系、相同帧区间或属性名猜领域语义；
- 绕过 Studio 的 revision、事务、校验和 Source range 写回机制。

Companion 与领域组件的兼容范围应由普通包版本关系表达。组件本身不反向依赖某个可执行 Companion；是否采用它是 Studio 分发或项目的选择。

这里的“输出 Type”是完整 `TypeRef`，包含 module、version 与 name。`VisualTrack` 之类的短名
只用于显示和诊断，不能参与 Companion、Film、Semantic 或 fallback 的选择；第三方模块声明一个
同名 Type 不会被官方 Companion 误认。

### Studio 应用与 ABI

Studio 提供受控的编辑器语言，而不是领域组件目录。它拥有：

- session、preflight、snapshot、播放、seek、缩放、滚动和选择；
- Source、Tasks、Artifacts 与 Preview；
- Companion 选择、身份限定、冲突检测和显式 replacement；
- Source revision、最小修改、失败回退和重新编译；
- 通用终端 Track 兜底和 Semantic 时间标尺；
- 统一外观、Inspector 控件和操作执行器。

Studio ABI 提供有限、稳定、可组合的外观全集：

- `presentation.chrome` 只选择 `standard / group / point` 这类 Studio 外壳，不决定标题、时间或正文是否存在；
- `display.title` 是第一行标题，时间由 Studio 根据 Window/Point 统一计算并紧随标题显示；
- `display.layers` 是有序的正文层，可组合 `text` 与 `preview`，并区分 `decoration / content`；
- preview 只携带 Artifact digest 或 Surface 身份，布局只能选择 `repeat-x / cover / contain / storyboard / waveform`；
- 视觉 tone、图标 token、lane 与附属 lane；
- Inspector 一级能力固定为 `Where / How / When`；Companion 可在实际需要时声明二级页、参数组和标准控件；
- 带精确逆变换声明的时间线手势；选择、seek 等基础交互由 Studio 对所有实体统一提供；
- `timeline.adjust`、`parameter.adjust` 等标准作者操作。

语义 family 与视觉 tone 必须分离。新 Companion 可以声明新的领域 family，但只能选择 Studio 提供的视觉 token，不能依靠 `.track-caption`、`.track-ranking` 一类组件名 CSS 获得外观。

Pattern 和 material 可以复合：前者通常来自组件 Surface Preview，后者来自本次 Run 的真实 Artifact；两者即使同为 SVG，也以来源和角色区分，而不是以 MIME 猜语义。Companion 不拼接 `/__studio/*` URL，Studio 才把来源描述符转换为本应用的 HTTP transport、storyboard 或 waveform。

外观全集可以在 ABI 内继续收敛；不变的是 Studio 控制渲染语法、Companion 只作声明。Studio 不得再用 `shape === text`、`shape === group` 一类条件决定标题、正文或时间。

## 选择与安装

Companion 选择必须显式，不使用包名猜测或目录扫描：

- 官方 Hypit Studio Distribution 显式选择它支持的官方 Companion；
- 项目可以通过可选 Studio Profile 选择项目 Companion 或 replacement；
- 其他 Studio Distribution 可以选择完全不同的 Companion；
- Studio 不扫描 `node_modules`，不看到 `@scope/example-track` 就猜测存在 `@scope/example-track-studio`；
- 打开 Studio 不联网搜索、静默安装或升级 Companion。

官方 Distribution 中的选择清单只表示“这个应用信任并支持哪些 Companion”，不得包含组件的实体投影、参数表或领域判断。普通用户无需为每个项目重复安装已经存在于机器级 Studio Distribution 中的 Companion。

项目 Profile 是可选的编辑器能力选择，不是 Hypit 项目清单，也不规定 SVML、SVS、SVRun 或素材的目录结构。不得为 Companion 再发明运行锁、摘要、哈希索引或第二份包管理数据库；安装与版本关系由现有包管理和 Distribution 负责。

## 缺少 Companion 时

领域组件的运行不依赖 Studio Companion。删除 Studio 或删除 Companion 后，SVML、SVS、SVRun、CLI、Runtime 和渲染必须继续工作。

Studio 没有找到专用 Companion 时：

- 标准 `VisualTrack` / `AudioTrack` 可以使用不识别模块名的通用兜底；
- 界面不得猜它是 Caption、Ranking、Media 或其他领域对象；
- 没有声明的 item 拆分、参数和操作保持不可用；
- 需要丰富编辑能力时，明确说明缺少显式选择的适配包。

通用兜底只用终端公共对象携带的准确 `subjectId` 接 Temporal 谱系。它不依次尝试 authoredId、
markerId、presentId、renderId；同一 subject 出现多条候选谱系时直接报告歧义，不取第一条。

通用兜底属于 Studio 基建。它可以理解跨领域稳定的终端协议，但不得出现官方组件模块名、Surface 名或参数全集。

## 数据投影原则

Companion 必须消费组件公开的领域真相，而不是反向解析最终画面。典型链路是：

```text
Author Source
  -> 公共 Program / Schedule / Temporal projection
  -> Companion 声明所需的同 Surface value ports
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

Companion 通过 `requiredValues` 声明投影 Track 所必需的同 Surface 输出，例如 Ranking 的 `schedule` 与 `program`。Studio preflight 必须把这些值纳入便宜、确定性的 projection closure；端口缺失、无法解析或值没有进入本次执行结果时直接拒绝打开，不允许专用 Companion 静默退回 generic。Program 只作为 `supporting-value` 进入投影闭包，不伪装成时间线实体。

当公共 Program item 或终端 `VisualPresent` / `AudioClip` 实现某个作者领域对象时，可以携带通用 `subjectId`。投影对象的 `id` 回答“本次消费/渲染对象是谁”，`subjectId` 回答“它实现哪个作者对象”；这是 renderer provenance，不是 Hypit Studio metadata。Media、Audio、Comment Sticker、Screen Overlay 和 Speech 都用这条公开关系保留作者归属，其他 Studio 和诊断工具同样可以使用。没有 `subjectId` 的第三方终端 Track 仍然合法，Studio 不用 id 前缀或同帧区间补猜。

## 操作边界

运行图声明时间 authority，Companion 声明组件界面，Studio 执行操作：

```text
Temporal runtime lineage
  -> 每个端点是 semantic / parameter / fixed
  -> parameter 端点点名准确的 Source binding 与关系

Companion
  -> entity 如何显示
  -> 哪些作者 binding 进入 Inspector

Studio
  -> 输入手势、吸附与坐标换算
  -> revision 校验
  -> 最小 Source 修改
  -> 重新编译、成功发布或失败回退
```

Companion 不获得文件写权限。没有唯一可逆 Source 映射的操作必须禁用，不能只因为画面上看起来可拖就生成写回。

Companion 不再声明通用时间逆函数。Studio 从实体实际执行得到的 `TemporalInstant` / `TemporalWindow`
逐端点读取 authority：Selection/Moment 指向 Semantic 作者身份，parameter 指向运行记录点名的准确
binding，fixed 禁止改变该端点的手势。这样新增 Track 只要消费公共时间对象，就不需要再抄一套
`move / trim-start / trim-end` 声明。

Inspector 与时间线可以依赖同一作者端点，但不能再共享一张含混的“参数表”。Companion 分别声明：

- `bindings`：准确的作者端点及引用路径 `through`，只负责 Source 可达性；
- `inspector`：从 binding 中选择真正允许用户调整的字段，并声明 `Where / How / When`、可选二级页、分组与控件；
- temporal lineage：由公共投影运行图携带手势所需的 Semantic Anchor 或 parameter binding，不属于 Companion。

Studio 只展示当前 Source 中确实存在、可写且被 `inspector` 选中的字段。它不会把隐藏的 traversal binding、时间线端点、只读引用或未声明属性顺手暴露出来，也不尝试依次猜 `recipe / style / appearance / motion / program`。

标量与结构化参数遵循同一条边界。领域包可以在公共 Recipe vocabulary 中把值声明为 number、enum、color、list 或 record；这只是作者语言的值语义，不认识 Studio。Companion 决定该值是否进入 Inspector 以及位于哪个页和组；Studio ABI 只提供有限的通用 `list / record / color` 组合能力，并按领域 schema 校验。SVS 负责 canonical value 与精确 Source range 之间的解析和序列化。任何一层都不允许为 `ranking-colors` 之类的具体组件名称增加专用分支。

官方 Companion 的字段表必须显式且封闭：新增领域属性却没有对应 Companion 声明时，适配器装载直接失败。禁止再根据属性名的 `color / frames / x` 后缀或片段猜控件、一级域或二级页。

## 当前官方 Companion

官方 Distribution 显式选择以下独立 Companion：

- `film-studio`：声明 Film 的 Composition、Semantic Track 与终端 Track 接线词汇；
- `script-studio`：声明 Script Source map 与 Selection/Moment marker 的精确逆写；
- `caption-fine-studio`；
- `typography-track-studio`；
- `media-track-studio`；
- `audio-track-studio`；
- `speech-track-studio`；
- `ranking-studio`；
- `deck-track-studio`；
- `comment-sticker-studio`；
- `screen-overlay-studio`。

每个包只解释对应领域模块。Studio 中的官方列表是 Distribution 的显式选择，不是根据 `-studio` 后缀自动发现；项目 Profile 仍可显式增加项目 Companion 或 replacement。

`film-studio` 与 `script-studio` 是边界 Companion，不投影普通时间线 item。前者避免 Studio
中心代码认识 `<Film>` 的属性和子节点接法；后者避免 Studio 直接依赖 Script parser/editor。
二者同样由 Distribution 显式选择，领域包仍不反向依赖它们。

Studio 核心只保留跨领域终端协议的通用 VisualTrack、AudioTrack 兜底和 Semantic 标尺。它不包含上述模块名、Surface 名或模块参数表。Caption Companion 已直接消费公开 `FineCaptionSchedule` 与 `CaptionDocument`，Ranking、Media、Audio、Typography、Speech 和 Deck Companion 也分别消费本领域公开值，不再由一个中央包从最终画面统一反推。

## 历史偏差

2026 年 8 月 20 日的 `74f976ab` 在新 Studio 落地时采用了 centralized video-domain policy。2026 年 8 月 23 日的 `36fa9ab0` 同时引入正确的 Companion ABI、项目 Profile 和错误的官方中央适配包：项目组件被要求使用独立 Companion，官方组件却被整体搬进一个总包。后续文档按当前代码描述包边界，使这个不对称看起来成为稳定设计。

本文恢复并固定原始原则：外部项目与官方组件遵循同一条 Companion 边界。把代码移出 `packages/studio` 只叫物理分离；只有每个领域模块的 Studio 解释由独立 Companion 拥有，才叫职责分离。

## 验收原则

当前实现和后续修改必须同时满足：

1. 领域组件包的依赖和源码中不存在 Studio ABI 或 UI 语义；
2. 一个官方 Companion 不适配多个互不相关的领域模块；
3. Studio 核心与通用兜底不枚举官方组件名、Surface 名或组件参数；
4. Companion 只使用公共 Program、Schedule、终端 `subjectId` 与时间谱系；
5. Companion 包通过显式 Distribution/Profile 选择，不扫描、不猜名、不静默安装；
6. 删除 Companion 只损失丰富编辑能力，不影响检查、构建、复用和渲染；
7. 删除 Studio 不影响领域组件及其用户项目；
8. 另一个 Studio 可以为同一组件发布另一套 Companion，无需 fork 组件；
9. Studio 的统一写回、失败处理和防抖不下沉到 Companion；
10. 不为迁移增加自造 lock、哈希、摘要、缓存数据库或固定项目目录结构。
11. 标题、时间与内容层是独立字段；任一 chrome 或素材层都不能隐式隐藏另外两者；
12. Companion 不知道 Studio HTTP 路由，所需同 Surface 值必须经 `requiredValues` 进入 preflight closure。
13. Script、SemanticTrack、ProgramSpace、TemporalSource 与终端 Track 的作者身份必须连续；不得用首项、同名或随机 id 补猜。

## 非目标

本文不决定：

- npm 发布批次和版本号；
- 为其他 Studio 设计通用行业标准；
- 让 Hypit Studio 成为完备 NLE。

这些实施选择可以调整，但不得重新合并三层所有权。
