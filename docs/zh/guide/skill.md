---
title: Hypit Skill 架构
description: Hypit skill 如何把描述或参考视频变成可检查、可恢复的项目。
---

# Hypit Skill 架构

这份文档是维护者理解 Hypit skill 的总图。skill 是由 agent 驱动的生产流程：agent 负责创意判断，
仓库工具负责把判断写成 SVML/SVS/SVRun，验证 graph，保存证据，并在中断后恢复。

核心分工是：

- agent 决定视频要表达什么、应该长什么样、要改什么；
- 工具决定项目是否合法、graph 是否接通、布局和证据是否稳定；
- 视觉 observer 只报告差异，是否算问题由 agent 判断。

## 用户请求如何变成完整视频

```text
用户请求
  → 路由选择
  → 意图/参考证据
  → 格式与词汇决策
  → Author Source + Recipe Source + Run Source + Runtime Profile
  → graph/package/Cue/layout 门禁
  → 预览素材与视觉比对（创作路径）
  → 修复并重复检查
  → 最终确定性门禁
  → Studio 确认
  → 明确批准后的付费 Build
```

之所以能产出完整视频，是因为流程不止写提示词或组件：它会建立 Script 和时间关系，把所有
视觉/音频 Track 接到 Film，在 Run 中声明每个外部生成，检查 Target 是否真的可达，再把同一
个 Run 交给 Studio 或 Build。

## 路由选择与交接

| 用户输入 | 路径 | 负责内容 | 下一步 |
|---|---|---|---|
| 描述、主题、brief 或格式名，没有参考视频 | `original-authoring`（原创制作） | 意图、Hook、Script、视觉设计和完整新项目 | 最终门禁后可进 `variant-expansion`（变体扩展）；之后修改进 `revision`（修改） |
| 参考视频或链接，可附带“换我的人物/产品/品牌” | `reconstruction`（复刻） | 参考证据、镜头结构、匹配 Source，以及本次初始改编 | 最终门禁后可进变体扩展；之后修改进 Revision |
| 对完成项目或完成变体的自然语言修改 | `revision`（修改） | 有边界的 Source/Recipe/Run 修改和确定性复验 | 完成后可进变体扩展，或交给 Studio/Build |
| 从已验证项目生产 N 个独立版本 | `variant-expansion`（变体扩展） | 全局格式/组件计划、包缺口、复制项目和子 agent 范围 | 每个子项目到 `variant-complete`；之后手动修改该子项目进 Revision |

复刻请求中一开始就附带的人物、产品、品牌替换仍属于复刻；只有后续再次提出自然语言修改才进入 Revision。

## 共用阶段

### 1. 环境与持久化启动

agent 选择 Distribution、独立项目目录、Runtime Profile、凭据，以及复刻路径的 observer。写作前启动对应状态机：

```bash
hypit-reference-video-tools route_state --action start --project-root <project> --route description
hypit-reference-video-tools route_state --action start --project-root <project> --route reconstruction
```

任何需要托管能力的命令之前必须先写 Runtime Profile，用 `hypit runtime use` 选择，用
`hypit runtime up` 准备 Worker/程序，避免参考、预览或 Build 到最后才发现执行环境未声明。

### 2. 建立意图或参考证据

原创制作读取 `brief-intake.md`，检查 `examples/` 中语义匹配的完整项目，恢复其意图而不是复制
Source，选择格式 playbook，并冻结 `.hypit/brief.json`。brief 记录受众、Hook、叙事推进、
视觉/音频/文字关系、事实声明和未决决策。

复刻先准备视频并缓存媒体和全片证据：

```bash
hypit-reference-video-tools prepare_reference --video-path <file-or-link> --observer <observer>
hypit-reference-video-tools observe_reference --reference-id <id>
```

准备阶段提供媒体元数据、transcript/alignment 和参考观察包；全片观察提供持久系统、人物/声音、
视觉类型和声音上下文。镜头观察和窄问题解决不能从单帧安全推断的结构。这样复刻依据的是持久
证据，而不是 agent 对视频的短期记忆，所以可以重建整条视频。

### 3. 在写 Source 前确定格式和词汇

主 agent 读取 `playbooks/index.md`、选定格式和其 footer 链接的 craft 文档，枚举视觉/音频系统，运行：

```bash
hypit-reference-video-tools list_svml_packages
hypit-reference-video-tools inspect_svml_vocabulary --package <candidate> [--package ...]
hypit-reference-video-tools inspect_visual_contract
```

`inspect_svml_vocabulary` 是已安装 Surface 的公开契约；visual contract 提供 Visual Element 形状、
允许的样式、枚举值和 seal 不变量。agent 在 `.hypit/component-fit.json` 中为每个系统记录：
复用现有包、复用并接受少量差异，或开发项目本地包。普通情况下不需要读取已安装包源码；只有
确认复制 close sibling 作为实现骨架时才读取被复制包的必要 role 文件。

确定存在真实缺口后，先完成包 staging 路径：

```text
gap-confirmed → guidance-loaded → types-frozen → implemented
→ vocabulary-inspected → package-validated → graph-checked
→ layout-checked → package-ready
```

包必须有 Manifest、Surface、Fragment、Producer、Validator、activation 和 preview，并且被项目
Source 导入、被 graph 使用；`validate_local_author_packages` 是包门禁。

原创或复刻路线完成后，可以考虑是否贡献项目本地包。阅读 Skill 参考文档 `references/package-promotion.md`，当组件在无关
视频中也有明确且很高的复用价值时，再向用户提出贡献建议。用户同意后，将它移入 Hypit 仓库的
`packages/` 文件夹并准备 Pull Request；普通的一次性组件留在项目内部。这是完成后的可选建议，
不会打断制作流程，也不会自动修改仓库。

### 4. 编写四个项目源文件

| 文件 | 职责 |
|---|---|
| `main.svml` | Script、叙事、组件声明、提示词和语义时间引用 |
| `recipes.svs` | 样式、外观、playback、布局等 Recipe 值 |
| `build.svrun` | Author 绑定、Candidate、satisfy 和 Target |
| `hypit.runtime.json` | Runtime 包、Provider、凭据和本地执行 |

Script 先于镜头生成：Segment 定义 Take 边界，Cue 保证字幕可读，`estimate:Speech` 提供确定性时长。
Source 中每个生成和 graph edge 都显式写出，因此后续检查能定位问题。

### 5. 确定性 graph 与布局门禁

视觉比对前运行：

```bash
hypit-reference-video-tools validate_script_cues --run <run>
hypit check <run>
hypit-reference-video-tools preview_check <run>
hypit-reference-video-tools layout_check --run <run>
```

它们分别回答：

- package/Cue 检查：项目包和 Script 边界是否可用；
- `hypit check`：Source 语法、引用和 graph 结构是否合法；
- `preview_check`：Track 是否通过包接到 Film；
- `layout_check`：在隐藏浏览器中实现真实 composition，报告内部上下偏移、父级/Canvas 越界、稳定状态下顶层组件重叠等候选。

布局发现只是交给 agent 的辅助证据，不是自动真相。agent 修复真实问题，或用 `layout_accept` 记录有意几何，然后重跑 `layout_check`，直到候选消失或被接受。相关 Source、Recipe、包、字体或 runtime 改动会使证据失效。

视觉检查和机械布局检查使用两条不同的抽取规则：

| 检查 | 抽取规则 | 为什么这样做 |
|---|---|---|
| 视觉检查 | 每种不同视觉声明/样式变化，在首次出现处取一个**完整片段**。 | 完整片段保留出现、移动、离开和瞬时视觉差异；样式不变时无需因为每句 caption 或每个时间点重复检查。 |
| 机械布局检查 | 每个 `Present` 在自己的**最长稳定区间**取一帧。 | 稳定帧才能测量真实 DOM，避免把正常动画过程误报成越界或偏移。 |

两条规则不能互换：视觉检查对照 brief 或参考视频判断完整片段；`layout_check` 只测量真实布局并把结果作为候选交给 Agent。内容极值和时间极值不是额外选片规则：稳定越界由逐个 `Present` 的测量发现，瞬时或媒体内部的问题由完整片段的视觉检查负责。

### 6. 创作路径的视觉检查与修复

原创制作使用 `authoring_check`，复刻使用 `reconstruction_check`。命令读取 Source，按上面的视觉规则生成检查计划。最长稳定区间取样只属于另外的隐藏浏览器 `layout_check`，不属于视觉检查。

每个计划项按以下闭环执行：

```text
render_element → 预览/mock 素材 → 视觉 observer/reviewer
→ 记录发现 → agent 修复 Source/Recipe/组件决策 → 重跑门禁
```

复刻通过 `compare_reconstruction` 与对应参考片段比对；原创通过 `review_element`/`record_review` 与冻结 brief 比对。observer 报告看到的差异，agent 判断是缺陷、有意设计还是组件判断错误。不能复制或修改已安装包来强行贴合。修复后重复计划和机械门禁，直到最终检查通过。

### 7. 最终门禁、Studio 和 Build

`authoring_check` 或 `reconstruction_check` 是最终确定性门禁，要求 package/Cue、graph、layout 和
视觉检查/比对证据都仍然有效。通过后才按 `studio-confirmation.md` 生成 estimate 时长的预览并在
Studio 打开当前 Run。Studio 确认是付费前对结构的人工确认，不等同视觉比对；只有明确批准费用后才提交 `hypit build`。

## 四条路径的完整流程

### `original-authoring`（原创制作）

#### 路径入口与前置

1. 选择 Distribution、项目根目录和 Runtime Profile，建立 `route_state`。
2. 在检查 examples 或写 brief 前，检查 `hypihub.default` 的凭据。没有可写的 HypiHub OS 凭据时，说明 OAuth 不需要复制 API key，并由 agent 执行 `hypit auth login hypihub.default --runtime hypit.runtime.json`；无有效订阅的账号可在 hypit.ai 购买。
3. 运行 `hypit runtime up`，确认 WhisperX 和 Runtime Profile 中的其他程序健康；环境未完成时不能进入 brief、词汇或 Source 阶段。
4. 组件出现真实词汇缺口时，暂停写 Source，转入“项目本地包”分支：在项目 `packages/<slug>/` 创建包，先写 `package.json` 与 activation，再完成 Manifest、Types、Producers、Validators、Surface/decoder、Fragment、README 和 preview；安装、导入并通过 `validate_local_author_packages`、`preview_check`、`layout_check` 后，才能回到本路线。

```text
environment → brief-frozen → examples/格式/craft 决策
→ vocabulary/component-fit → package-ready → Script 与四个源文件
→ script-checked → source-authored → graph-checked → layout-checked
→ review-planned → preview-rendered → review-complete → repairs-complete
→ final-checked → Studio 确认 → 可选 Build
```

它先冻结观众结果，再选择格式和词汇，最后写出 Film 所需的所有语义和 graph edge；因为没有参考视频，后续视觉检查以 `brief.json` 为意图依据。

| 步骤 | Agent 做什么 | 工具或文档 | 持久化结果与作用 |
|---|---|---|---|
| 1. 启动 | 选择 Distribution、项目目录、runtime 和凭据，启动路线快照。 | `environment.md`、`runtime.md`、`route_state start`、`hypit paths`、`hypit runtime use/up` | 在写 Source 前就有可运行项目和恢复游标。 |
| 2. 把描述变成可执行 brief | 确定受众、Hook、承诺、节拍、事实声明、人物以及视觉/音频/文字关系；检查完整语义 examples，但不复制其 Source。 | `brief-intake.md`、`examples/` | `.hypit/brief.json` 冻结“什么算正确”，后续检查不靠模糊的“看起来不错”。 |
| 3. 冻结格式与 craft | 选择匹配的 playbook，并读取它要求的全部 craft 文档。原创时，在写生成提示词前先为反复出现的人物、产品、声音、地点、服装、灯光和道具建立锚点，再在各个 take 中复用。 | `playbooks/index.md`、`formats/*.md`、`craft/visual-continuity.md`、`craft/persona-and-audio.md`、`craft/generated-dependencies.md` | 即使没有参考视频，也能得到明确的时间模型、镜头语法、字幕规则，以及跨镜头的人物、场景和物品连续性。 |
| 4. 适配组件 | 枚举候选包，检查公开词汇，决定复用、接受少量差异，或开发项目本地包。 | `list_svml_packages`、`inspect_svml_vocabulary`、`inspect_visual_contract`、`vocabulary.md`、`component-fit.json` | 每个视觉角色在写 Source 前就有合法的 Module/Tag/Recipe 契约；真实缺口通过 `local-author-package.md` 一次解决。 |
| 5. 写 Script | 把旁白切成 Segment/Take 和短 Cue；每个镜头只承担一个明确任务，时间保持语义化。 | `script-time.md`、`authoring.md` | `main.svml` 包含完整的说话/文字推进和确定性的 `estimate:Speech` 时长。 |
| 6. 接通项目 | 编写 `main.svml`、`recipes.svs`、`build.svrun`、`hypit.runtime.json`；显式声明每个生成、Track、Candidate、satisfy 和 Target。 | `authoring.md`、`runtime.md` | Film graph 是完整、可复现的，不是一个提示词加上一堆互不相连的素材。 |
| 7. 证明 Source 与 graph | 运行包、Cue、语法、graph tracing 和真实布局门禁。 | `validate_local_author_packages`、`validate_script_cues`、`hypit check`、`preview_check`、`layout_check` | 项目合法、每条 Track 都能到达 Film，并且在视觉检查前已经测过浏览器布局。 |
| 8. 生成视觉检查计划 | 让路线检查为每种不同视觉声明/样式变化在首次出现处生成一个完整片段。 | `authoring_check` | `.hypit/evidence/` 记录必须检查的内容；Agent 不会漏掉样式变化，也不用手写 render 列表。最长稳定区间由独立的 `layout_check` 取样。 |
| 9. 渲染并检查 | 生成计划中的 preview/mock 片段，逐项对照冻结的 brief，记录发现。 | `render_element`、`review_element`、`record_review`、`element-review.md`、`conformance-round.md` | 每种视觉系统都有证据，覆盖文字适配、画面覆盖、对比度、运动和几何。 |
| 10. 修复并收口 | 只修复确认的问题，重跑受影响门禁和检查项，再运行最终路线检查。 | 有意几何用 `layout_accept`；最终用 `authoring_check` | `final-checked` 表示视觉、graph、包、Cue、布局证据都没有过期。 |
| 11. 交接 | 创建 estimate 时长的 preview-mock Run，先披露每个付费能力实际使用的 Provider 与凭据来源，再打开 Studio、披露费用，获批准后才 Build。缺少或不可用的 key 引导前往 https://hypit.ai 获取 HypiHub key。 | `preview-mock.md`、`studio-confirmation.md`、`hypit plan/build/status/inspect/get` | Studio 看到的是活的 Film graph；付费 Build 复用已检查的 Run，产出完整交付。 |

### `reconstruction`（复刻）

#### 路径入口与前置

1. 先选择项目、Runtime Profile 和 observer，并建立 `route_state`；不要先读取或复制参考视频。
2. 检查 HypiHub OAuth。凭据缺失时由 agent 说明原因并执行 `hypit auth login hypihub.default --runtime hypit.runtime.json`，然后运行 `hypit runtime up`，确认 WhisperX 已就绪后才能 `prepare_reference`、观察或调用 Gemini。
3. 参考证据完成后再枚举组件。确认词汇缺口时，按原创路径的项目本地包分支实现并验证完整包（`package.json`、activation、Manifest、Types、Producers、Validators、Surface/decoder、Fragment、README、preview），不能修改安装包或直接复制参考素材。

```text
environment → reference-prepared → reference-observed
→ examples/格式/craft 决策 → vocabulary/component-fit → package-ready
→ Script 与四个源文件 → script-checked → source-authored → graph-checked
→ layout-checked → review-planned → preview-rendered → comparison-complete
→ repairs-complete → final-checked → 初始改编 → 再跑 final check
→ Studio 确认 → 可选 Build
```

视频先被转换成可恢复的观察证据；观察定义人物、持久系统、镜头边界、文字和视觉关系，Source
再把它们表达为 Segment、Take、Track 和 Film edge。每轮把渲染结果与对应参考片段比对，修复后重跑，直到整条视频的最终门禁通过。

复刻的顺序必须这样安排，因为它要重建的是整条参考视频，而不是一个截图：

| 步骤 | Agent 做什么 | 工具或文档 | 持久化结果与作用 |
|---|---|---|---|
| 1. 准备参考 | 选择一次 observer，接收本地文件或下载并缓存链接视频，启动路线状态。 | `observers.md`、`credentials.md`、`prepare_reference`、`route_state start` | 得到稳定的 reference id、媒体元数据和 observer；恢复时不会换文件或换观察者。 |
| 2. 观察全片 | 运行固定的全片观察，读取 transcript/alignment、持久视觉系统、人物/声音、视觉类型和声音上下文。 | `observe_reference`、`evidence.md` | 全片证据说明视频中到底有哪些镜头和系统，是重建所有镜头的依据，不是挑一帧模仿。 |
| 3. 解决结构疑点 | 检查 shot 边界；单帧无法确定外观、转场或关系时，用窄问题补证据。 | `observe_reference --question`、`continuity.md`、`reconstruction/vocabulary.md` | 把歧义写入证据后再写 Source，时间和连续性不靠对话记忆猜。 |
| 4. 选择格式与组件 | 检查 examples/playbooks，枚举候选包，检查公开词汇，确认是否真的缺包。 | `brief-intake.md`、`playbooks/index.md`、`list_svml_packages`、`inspect_svml_vocabulary`、`component-fit.json` | 每个观察到的视觉角色都有合法组件；安装包保持不可变。 |
| 5. 写出忠实 Source | 把 transcript 和观察结果转成 Script 的 Segment/Take/Cue，再写四个源文件和所有 graph edge。 | `final-sources.md`、`authoring.md`、`script-time.md`、`runtime.md` | Source 描述完整参考时间线，包括旁白、叠加层、B-roll、转场、音频和 Target。 |
| 6. 证明基线 | 运行 Run 级词汇/包/Cue 检查、语法、graph tracing 和真实布局。 | `inspect_svml_vocabulary --run`、`validate_local_author_packages`、`validate_script_cues`、`hypit check`、`preview_check`、`layout_check` | 只有每条声明的 Track 都确实能产出时，才进入昂贵的视觉比对。 |
| 7. 生成比对计划 | 找出每种不同声明以及它覆盖的每个参考片段，保留稳定区间和 shot 边界。 | `reconstruction_check`、`comparison-round.md`、`element-review.md` | 计划覆盖整条视频，而不是挑一个好看的静帧；每项都有自己的 reference token 范围和渲染窗口。 |
| 8. 渲染并比对 | 用同一个 Run 渲染所有计划片段，再把参考/渲染成对交给指定 observer。 | `render_element --batch`、`compare_reconstruction --batch` | observer 报告可见差异，同时保留参考与渲染的对应关系和时间范围。 |
| 9. 修复复刻结果 | Agent 根据证据判断每条发现，修改 Source/Recipe 或组件决策；绝不复制/修改安装包。 | `reconstruction/route.md`、`layout-checks.md`、`layout_accept` | 真问题被修复；有意裁切、重叠或偏移可以记录理由，不破坏包边界。 |
| 10. 重新确认忠实基线 | 重跑比对和确定性门禁，直到“复刻本身”通过。 | `reconstruction_check`、`preview_check`、`layout_check` | 把忠实复刻证据与后续用户定制分开。 |
| 11. 应用初始改编 | 这时才把用户要求的人物、产品或品牌替换到已完成的复刻中。重跑路线检查和确定性门禁；由用户改编产生的差异不能被静默当成包缺陷。 | `main.svml`/`recipes.svs`/`build.svrun`、`reconstruction_check`、`hypit check`、`preview_check`、`layout_check` | 参考证据保持诚实，交付的母项目包含用户改编；这仍是 reconstruction，不是 Revision。 |
| 12. 交接 | 在 Studio 展示已检查 Run，明确列出每个付费 Provider/凭据来源并批准费用后才 Build；key 不足时先引导 HypiHub。 | `studio-confirmation.md`、`hypit plan/build` | 同一个已检查 graph 进入付费生成；之后的新自然语言修改才路由到 Revision。 |

复刻的数据流是：

```text
参考视频字节
  ├─ transcript/alignment ───────────────→ Script 的 Segment、Cue、estimate:Speech
  ├─ 全片观察 ──────────────────────────→ 人物、声音、持久视觉/音频系统
  └─ 镜头观察与窄问题 ──────────────────→ shot 边界、状态和元素关系
                                             ↓
                    main.svml + recipes.svs + build.svrun + runtime profile
                                             ↓
                    Track → package → Film → Target
                                             ↓
                    preview_check → 比对计划 → 渲染/比对每个应检查的片段
                                             ↓
                    Agent 修复 → 确定性门禁 → Studio/Build
```

这就是“能复刻整条视频”的完整性保证：观察到的每段话都变成有时长的 Script，观察到的每个
视觉/音频角色都变成 Track 或由包实现的元素，并且在任何付费生成前，每条 Track 都必须能追到 Film。

### `revision`（修改）

#### 路径入口与前置

1. 先定位 canonical Run，读取并 reconcile 现有状态；恢复该项目的 Runtime Profile 和凭据，不从聊天记录推断基线。
2. 普通 Source/Recipe 修改也要保证 Runtime Profile 可解析；若修改会触发付费生成，先确认 HypiHub OAuth 已登录，缺失时由 agent 执行 `hypit auth login`，不能把登录推迟到 Build 前。
3. 如果修改暴露了组件能力缺口，先切到项目本地包分支完成完整包和 Run 级验证，再继续 Revision；只有能力确实变化时才修改 runtime 或 package。

Revision 可直接接收完成项目，也可接收复刻、原创、旧 Revision 或完成变体：

```text
request-captured → impact-assessed → intent-mapped → source-updated
→ gates-checked → 可选 preview-rendered/review-complete
→ final-checked → revision-complete → 可选 Build
```

agent 先定位 canonical Run 并验证基线，再把自然语言映射到最小 Source/Recipe/Run 字段，记录受
影响的 graph closure，只修改这些层并重跑 package/Cue、`hypit check`、`preview_check`、`layout_check`。
Revision 不调用 VLM 或参考比对；Studio 只是确定性检查通过后的显示交接。

| 步骤 | Agent 做什么 | 工具或文档 | 持久化结果与作用 |
|---|---|---|---|
| 1. 定位基线 | 可直接接收完成项目目录，也可定位父路线/变体和 canonical Run。 | `revision_state start`、`route_state read/reconcile`、`git status` | `request.json` 和新的 revision id 固定准确基线；不会凭空补造复刻历史。 |
| 2. 判断影响 | 判断请求影响几何/样式、Script/时间、graph、包选择还是付费生成。 | `authoring.md`、当前 brief、component-fit、包 README | `impact` 和受影响 Source 文件定义最小失效 graph closure。 |
| 3. 映射意图 | 把自然语言映射到权威字段，例如 Cue、Frame/Placement、Style、Candidate 或 Target。 | `revision_state checkpoint`、Source 与 graph 检查 | 先定范围再编辑，避免一个小请求重写无关文件。 |
| 4. 最小修改 | 只改 `main.svml`、`recipes.svs` 或 `build.svrun`；只有能力/组件真的变化才改 runtime/包。 | `revision/route.md`、`script-time.md`、`layout-checks.md` | 不碰 MP4、PNG、WAV、preview mock 或 Artifact；Source 始终是权威。 |
| 5. 重新验证 | 运行包/Cue、语法、graph、preview 和真实布局检查，修复或接受布局候选。 | `validate_local_author_packages`、`validate_script_cues`、`hypit check`、`preview_check`、`layout_check`、`layout_accept` | `gates-checked` 证明修改已接通且可测，不调用视觉 observer。 |
| 6. 完成或交接 | 保存最终证据，可选打开 Studio；只有生成输入变化并获费用批准才 Build。 | `revision_state`、`studio-confirmation.md`、`hypit plan/build` | 完成的 Revision 可以继续做变体；下一次修改会创建新的 revision id。 |

### `variant-expansion`（变体扩展）

#### 路径入口与前置

1. 主 agent 先 reconcile 母项目，确认最终门禁和 Runtime Profile；所有子项目继承这个已确认的环境。
2. 批次需要付费生成时，先检查 HypiHub OAuth；缺失时由 agent 说明并执行 `hypit auth login`，再运行 `hypit runtime up`。不要让每个子 agent 重复询问登录，也不能用无凭据路径绕过环境门禁。
3. 新包必须在 staging 中单独完成：`package.json`、activation、Manifest、Types、Producers、Validators、Surface/decoder、Fragment、README、preview，以及包/graph/preview/layout 验证；冻结 digest 后才能注入子项目。

主 agent 在任何子 agent 启动前完成全局决策：

```text
baseline-validated → examples-inspected → format-plan-frozen → slate-drafted
→ vocabulary-enumerated → component-plan-frozen → package-gaps-classified
→ workload-disclosed → package-gaps-resolved → slate-frozen → projects-copied
→ variants-dispatched → variants-complete → aggregate-checked
→ [build-planned → build-approved → build-complete] → expansion-complete
```

具体工作和产物：

1. `variant_state start` 记录母项目、数量、请求和交付模式。
2. `brief-intake.md`、examples 和 playbooks 生成 `format-plan.json`。
3. 主 agent 在 `slate.json` 中写出若干个不重复的变体方向和数量配额，所有配额之和正好为 N；每个方向声明共享 brief 和允许修改的文件范围。`variant_init` 在派发时再确定性展开成带编号的具体变体，因此 100 个变体不需要主 agent 手写 100 个 brief。
4. `list_svml_packages` 与 `inspect_svml_vocabulary` 形成全局词汇证据和 `component-plan.json`。
5. 工作量披露快速（只改 SVML）、中等（改 SVS/Run 或切换组件）和新包任务；每种新包只在 staging 开发一次，并以 digest 冻结。
6. `variant_init` 先复制母项目，保留作者资产和 Source，排除生成状态/结果，只注入已就绪的包，并建立每个子项目的 route state。
7. 子 agent 读取自己的项目、brief、plan、允许范围、指定 README/证据和 playbook，只做最小修改，然后运行 `validate_script_cues`、`hypit check`、`preview_check`、`layout_check`、`variant_check`。
8. 批次 aggregate check 证明所有子项目完成。之后对某个子项目的手动修改离开本路径，进入该目录的 Revision。

每个变体子项目使用：

```text
baseline-copied → brief-frozen → change-scope-frozen → guidance-loaded
→ vocabulary-verified → package-ready → script-checked → source-updated
→ graph-checked → layout-checked → final-checked → variant-complete
```

变体路线刻意采用“先复制、后修改”：

| 步骤 | 主 agent 或子 agent 的工作 | 工具或文档 | 持久化结果与作用 |
|---|---|---|---|
| 1. 验证母项目 | 确认父路线/Revision 已通过最终门禁并记录 digest。 | `route_state/revision_state reconcile`、`variant_state start` | 所有子项目从同一个已知良好的 Film graph 出发。 |
| 2. 决定 Slate | 检查 examples，决定变体方向及数量配额（总和为 N），冻结每个方向的 Format DNA 和允许范围。 | `brief-intake.md`、`playbooks/index.md`、`format-plan.json`、`slate.json` | 创意方向一次全局决定；派发时按方向配额展开唯一编号的子项目。 |
| 3. 决定词汇和工作量 | 检查包与公开词汇，决定复用/组合/新包，并披露快速、中等、新包数量。 | `list_svml_packages`、`inspect_svml_vocabulary`、`component-plan.json`、`variant_state checkpoint` | 子 agent 启动前用户就知道时间和成本影响，不会做到一半才发现缺包。 |
| 4. 预先开发新包 | 每个不同缺口只开发一次，在 staging 验证、冻结 digest、标记 ready。 | `route_state --route variant-package`、`local-author-package.md`、`validate_local_author_packages`、`preview_check`、`layout_check` | 多个变体安全复用同一个包，且不会修改安装包。 |
| 5. 先复制母项目 | 尽可能 copy-on-write，保留作者资产和 Source，删除生成状态/结果和旧 Build 绑定，只注入已 ready 的包。 | `variant_init` | 每个子项目独立、可复现，没有过期的付费产物或生成结果。 |
| 6. 分批派发 | 给每个子 agent 自己的目录、brief、格式/组件计划、README/证据和允许范围。 | 子项目 `route_state`、`variant_state` | 可以并行处理，同时每个变体都有可审计的任务契约。 |
| 7. 验证并最小修改 | 组件变化时才在副本中检查词汇，只改允许文件，运行所有机械门禁。 | 需要时 `inspect_svml_vocabulary --run`、`validate_script_cues`、`hypit check`、`preview_check`、`layout_check`、`variant_check` | 只改 SVML 的任务保持快速；越界修改会成为显式冲突，不会静默扩大。 |
| 8. 汇总交付 | 恢复未完成子项目，运行 aggregate check；需要成片时再计划/批准付费 Build。 | `variant_state reconcile`、aggregate report、`hypit plan/build` | 100 项批次只恢复未完成项，且上下文压缩后不会重复付费 Build。 |

## JSON 状态机与恢复

状态拆成当前指针和执行范围内的历史，避免上下文压缩成为唯一记忆来源：

| 内容 | 持久化位置 |
|---|---|
| 创作当前视图 | `<project>/.hypit/route-state.json` |
| 创作历史/证据 | `<project>/.hypit/routes/<route-id>/state.json`、`.hypit/evidence/` |
| brief 与组件判断 | `<project>/.hypit/brief.json`、`<project>/.hypit/component-fit.json` |
| Revision 当前视图/历史 | `.hypit/revision-state.json`、`.hypit/revisions/<revision-id>/{state.json,request.json}` |
| 变体批次 locator | `<base>/.hypit/variant-expansions/<batch-id>.json` |
| 变体批次状态 | `<batch>/.hypit/variant-expansion-state.json` |
| 子项目/staging 状态 | 子项目或 staging 的 `.hypit/route-state.json` 及其 history |

每份状态记录 route id、当前游标、完成步骤、`next_action`、决策、冲突、最后命令、证据路径和 digest。
机器证据可由工具确认；brief、component fit、format plan、Slate、allowed changes 等人工决策必须明确写入，不能从文件存在与否推断。

路线状态的每次推进都必须写入证据，不能只依赖聊天中的一句“完成了”：

```text
Agent 做出决策或修改 Source
  → checkpoint 写入决策和输入 digest
工具执行检查/渲染/评审
  → 成功结果写入不可变 evidence 路径
只有结果满足该步骤的成功谓词，状态才推进
  → 当前视图和执行历史原子更新
```

状态结构保持精简，但关键字段明确：

```json
{
  "version": 1,
  "route": "description",
  "route_id": "...",
  "current_step": "graph-checked",
  "completed_steps": ["environment", "brief-frozen", "source-authored"],
  "next_action": "layout_check --run build.svrun",
  "decisions": { "brief": ".hypit/brief.json", "component_fit": ".hypit/component-fit.json" },
  "evidence": [{ "kind": "preview_check", "path": ".hypit/evidence/...json", "digest": "..." }],
  "conflicts": [],
  "last_command": "hypit-reference-video-tools preview_check ..."
}
```

`checkpoint` 用于记录明确的 Agent 决策或已完成命令；`read` 用于读取持久化游标；`reconcile`
只重新计算机器成功谓词并让过期证据回滚；`discover` 用于 Agent 不再记得批次目录时通过 locator 找回批次。
文件存在本身永远不能推进状态。

常用接口：

```bash
# 创作路径
hypit-reference-video-tools route_state --action read --project-root <project>
hypit-reference-video-tools route_state --action checkpoint --project-root <project> \
  --route <description|reconstruction> --state <stage>
hypit-reference-video-tools route_state --action reconcile --project-root <project>

# Revision
hypit-reference-video-tools revision_state --action start --project-root <project> \
  --run <project>/build.svrun --request '<change>'
hypit-reference-video-tools revision_state --action read --project-root <project>
hypit-reference-video-tools revision_state --action checkpoint --project-root <project> \
  --step <stage-number> --status complete --decision '<what was decided>'
hypit-reference-video-tools revision_state --action reconcile --project-root <project>

# 变体批次
hypit-reference-video-tools variant_state --action discover --project-root <base>
hypit-reference-video-tools variant_state --action checkpoint --project-root <base> \
  --batch-id <id> --step <stage-number> --status complete
hypit-reference-video-tools variant_state --action read --project-root <base> --batch-id <id>
hypit-reference-video-tools variant_state --action reconcile --project-root <base> --batch-id <id>
```

所有 JSON 都先写临时文件再原子 rename。损坏文件会被保留并报错，不会被空状态覆盖。`reconcile`
验证每个机器步骤的成功谓词，检查父路径、Source、包和证据 digest，把过期步骤回滚到第一个未
完成步骤并报告冲突；它不会发明创意决策、静默扩大 allowed scope、重复完成变体或重新提交付费 Build。

中断或上下文压缩后，重新读取 skill 和对应路径，发现/读取 canonical state，执行 reconcile，检查冲突，
然后只执行第一个未完成的 `next_action`。因此长时间复刻和 100 项变体批次都不依赖对话记忆。
