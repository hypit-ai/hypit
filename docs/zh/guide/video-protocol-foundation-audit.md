---
title: 视频领域协议迁移与基建审计
description: 记录 Twinit 到 Hypit 迁移后空间、字幕、时间消费、参数暴露及基础呈现协议的现状、缺口和分阶段任务。
---

# 视频领域协议迁移与基建审计

> 状态：审计与任务记录，尚未形成实施规格。
>
> 本文记录 2026 年 8 月对旧 Twinit 与当前 Hypit 的一次视频领域协议对照。它固定已经验证的事实、
> 不应退让的边界和必须逐项处理的任务，但不固定最终类型名、元素名、包拆分、Studio 标签或迁移工具形式。
> 后续每一项都应先完成针对性设计，再单独实施和验收，不能把本文直接翻译成一次大重构。

## 一、审计目的与产品前提

这次审计不是为了恢复一个完整 NLE。Hypit 面向的是纯 AIGC、带明确作者意图、需要批量生产广告视频的
工作流：先把第一个范例的位置、样式和时间编排调明白，再用同一作者程序批量生产后续 1–100 条视频。

用户在 Studio 中最常做的仍然只有两类轻量作者调整：

- 调整时间线上的时间；
- 调整当前对象的位置、样式和其他参数。

画面内直接拖动只是空间参数调整的一种手势，不产生第三种作者真相。没有作者意图的素材导入、传统主时间线
剪辑、通用 ripple/roll/razor/overwrite 以及从一段普通录制视频开始剪辑，都不在本轮基建范围内。

另一个不可破坏的前提是：能打开 Studio 的特殊 Candidate 必须已经完全 satisfied。Studio 不猜素材、不调用
Provider、不生成占位；未来若需要一张静止图片临时代替 B-roll，也必须由一份明确 Candidate 表达。

## 二、不能再混在一起的六层事实

旧迁移的问题之一，是用“已经有一个新包”代替了完整能力验收。今后的每一项视频能力必须分别检查六层：

1. **作者层**：SVML/SVS 能否完整、无歧义地表达作者意图；
2. **选择层**：Selection、Moment、Segment 或 Program 是什么语义来源；
3. **投影层**：语义来源怎样在组件外得到 TemporalWindow 或 TemporalInstant；
4. **消费层**：组件怎样消费窗口、素材、空间和局部动画，不再偷偷重新选择或投影；
5. **渲染层**：Visual IR、HyperFrames、音频或媒体执行是否准确实现该语义；
6. **Studio 层**：真实作者对象是否可选择、可解释，并能回写全部声明为可调的参数。

只有六层都得到确认，或者缺失层被明确标为产品取舍，迁移任务才能称为完成。

## 三、总体结论

| 领域 | 当前状态 | 判断 |
|---|---|---|
| Selection/Moment 到 Window/Point | 已外化，谱系可追踪 | 方向正确，应保留 |
| SpatialFrame 与 ContentFit | 职责清晰、确定性强 | 基座基本成立 |
| Media Item/Sequence | 两盒、多层、占用、动效和交接较完整 | 迁移主体成功 |
| Typography | 布局、Paint、字体和运动很完整 | 可作为共享文字基座 |
| Caption Fine Paint/局部动效 | 已覆盖大量常用视觉效果 | 有价值，但不是完整字幕协议 |
| Caption 空间与排版 | 静态范围被揉进 Style，缺少旧范围盒能力 | 基础设计需要重审 |
| Caption 时间消费 | 动效只在 Cue 原窗口内运行 | 缺少显式可见包络 |
| Caption Studio 参数 | 派生 Cue 无法追到 Program/Style/Recipe | 当前实际不可用 |
| Speech/A-roll 呈现 | 只保留 Frame、Fit、Z | 相比旧 Base 明显缩窄 |
| Screen FX | 自绘 Overlay 保留，底层像素变换删除 | 缺显式 Surface 变换能力 |
| Audio Track | 精确采样、占用、淡入淡出清楚 | 当前没有核心迁移缺口 |
| Film/Composition | 平级 Track、绝对叠放与清底色清楚 | 当前没有核心迁移缺口 |

不能把上述状态概括成“Twinit 全迁坏了”，也不能继续概括成“所有旧能力已经完成迁移”。Media、Temporal、
Typography 和 Audio 的基础值得保留；Caption、Speech Visual、Surface Transform 与 Studio 参数 ABI 是主要旧账。

## 四、Hero Meme 字幕事故

Hero Meme 是本轮审计的第一个真实证据，不是单独项目里一个无关的坏参数。

项目的 `caption.meme` Recipe 写有：

```text
x = 0.05
y = 0.75
width = 0.9
anchor-x = center
anchor-y = top
size = 64
line-height = 80
```

在 1080×1920 画布上，字幕框宽度是 972px，水平锚点是 54px。中心锚定后左边界是
`54 - 972 / 2 = -432px`，因此大部分框位于画面左侧之外。

当前 Caption Fine 把 `line-height` 作为无单位字号倍数传给 CSS。`64px × 80` 得到 5120px 行盒。
真实 Studio 预览测得该 Caption placement 约为：

```text
x = -432
y = 1440
width = 972
height = 20504
```

所以 Studio 中“左下出画的巨大矩形”和画面中看不见字幕都是实际渲染几何，不是 Overlay 测量误差。

本事故同时暴露四件事：

1. `x/width/anchor` 是合法但容易误写的低层组合，没有明确的 Caption Range 作者对象；
2. `line-height` 的维度没有在作者协议中防止像素值与倍数混用，当前校验只要求它大于零；
3. 字幕 Cue 的作者真相已经改变，但旧计划没有可靠迁入新的 Script 分段；
4. Studio 选中 Caption Cue 后没有参数，用户无法在可视环境中发现并修正这组源值。

Hero 目录还保存了一份 12 Cue 的 `studio-caption-plan.json`，但当前 SVML/SVRun 不消费它。当前 Caption 以
Script 的 `||`、Segment/Turn 等作者结构决定 Cue；Hero Script 没有迁入对应断点，最终只得到 6 个大 Cue。
这份 JSON 是失效的历史真相，不能重新接成隐藏输入，也不能继续留给用户误以为它控制成片。

本轮不修 Hero。它应保留为后续协议设计和真实迁移验收用例，最终修复必须同时覆盖几何、单位、Cue 作者真相
和 Studio 参数可达性，而不是只把 `80` 改成另一个数字。

## 五、空间与 Media 协议

### 5.1 已经成立的基础

当前 Media 保住了 Twinit 两盒模型中最重要的区分：

```text
SpatialFrame：组件在画面上占据的内容框
ContentFit：素材如何被采样进该内容框
```

当前能力包括：

- 一个 Frame 中按顺序放置 Paint、Still、Timed Media 或 Surface Layer；
- 每个 Sample Layer 独立 contain/cover/fit-width/fit-height/native/scale-down/stretch；
- frame point、content point、像素偏移与 bounded/free 约束；
- Frame Paint、Padding、方形/圆角/Path Clip、Border 与多重 Shadow；
- Sample opacity、blur、brightness、contrast、saturation；
- trim 与 once/hold/loop/stretch 占用；
- enter、sustain、exit 生命周期动效；
- 窗口归一化的平移、缩放、旋转采样关键帧；
- Sequence 的显式 Member、Activation Point、Terminal、Handoff 与音频处理；
- source audio、enter/exit/handoff Sound。

旧系统“同一素材先 cover+blur 铺底，再 contain 画前景”的固定字段，现在可以由两个显式 Layer 表达。
这是更通用、更解耦的更新，不应恢复成 MediaTrack 的特殊模式。

### 5.2 仍需处理的问题

- 旧 VLM/主体/避让/路径等语义空间定位被迁移文档明确延期。它们若恢复，应是显式输入、显式输出的独立
  解析包，不向 Spatial Core 或 Runtime 注入猜测；
- Speech Visual 只复用 Frame 和 ContentFit，没有复用完整 Media Presentation；
- 旧 Base/全屏媒体可以对 lower composite 做交接的能力被删除，普通 Media Sequence 只能在自己拥有的成员间交接；
- Studio 目前能编辑普通 Item 的 Frame 和现有 Recipe，但不能把 Layer、Sampling Keyframe、Member、Handoff、
  Sound 等嵌套作者对象作为独立参数上下文完整展示。

### 5.3 空间基建需要回答的问题

- Caption、Media、Typography 和普通组件应共享到什么层级的 Placement Frame；
- Frame、内容采样、Frame Paint 与允许越界的视觉效果如何保持正交；
- 画布拖动时，何时可以唯一反解到 Frame，何时只能保持只读；
- 语义空间解析结果以什么显式作者/运行边进入 Frame，而不是让组件内部调用模型；
- 不同组件是否需要受约束的专用 Frame 形态，还是只需复用基础 SpatialFrame 加领域校验。

这些问题得到答案前，不为 Caption 另造一组只在 Studio 中存在的 x/y/width 状态。

## 六、字幕协议

### 6.1 当前保留和增强的能力

Caption Fine 已支持：

- 精确 Font Artifact Stack；
- 普通/当前词 fill、gradient 和 opacity；
- 普通/当前词 outside stroke；
- drop shadow、long shadow 和 glow；
- cue background、border、padding、radius；
- karaoke current/trail 与 step/wipe；
- 普通/当前词 underline；
- current/trail active box 及其连续性；
- Cue、Atom、Active Response 的一次性动效；
- Cue 或 Active Atom 的循环动效。

描边问题不应再被归因于“React 迁到 HTML”。React 最终同样渲染 DOM；旧 Twinit 对宽外描边也需要
双层字形绕过 `-webkit-text-stroke` 的居中描边。当前 HyperFrames 使用 SVG morphology 实现
inside/center/outside Paint，Caption Fine 固定消费 outside。这是渲染基座升级，不是迁移缺口。

通用 Typography 之所以暴露 inside/center/outside，是因为它服务任意文字图形；Caption 不必把三种描边
位置都变成字幕作者参数。

### 6.2 当前缺失或退化的能力

与旧 Subtitle Track 相比，当前没有完整保留：

- 与 Style 正交的静态 Caption Region；
- 左右范围、纵向锚点、底部安全区和每行最多词数；
- 三盒布局：范围盒、Cue 盒、逐行实际内容盒；
- 超宽行继续按像素换行、单个超长词不得越过范围盒的保证；
- max lines 等显式布局约束；
- dual-font editorial；
- word importance 与逐词大小；
- size jitter；
- backdrop blur；
- strict timing、max hold 与 tail；
- enter lead；
- 旧 Caption Plan 的可靠作者迁移。

当前 Fine Caption 的 Paint 能力很多，但“视觉效果多”不能代替完整的空间、排版和时间消费协议。

### 6.3 当前结构上的核心问题

当前 Caption Style 同时携带：

```text
位置 + 排版 + 字体 + Paint + Karaoke + 局部动效
```

这会造成两个不合理结果：

- 更换一个视觉 Style 可能顺带移动整条字幕；
- Studio 选择一个 Cue 时，不容易区分整轨 Placement、规则 Style 和当前 Cue 的派生时间。

旧系统更合理的职责是：整条字幕轨拥有静态 Region；全文/Selection 规则决定 Style/Renderer；Cue 只拥有
内容和语义时间；每种 Caption renderer 消费共同的 Region、Cue 与文字 Paint 基座。

这只是职责方向，不预先规定最终必须新增哪个元素或拆成几个包。需要先验证 Fine、Word Importance、Dual Font
是否应是多个 renderer family，还是一套共享 Caption Program 下的多个可安装作者组件。

### 6.4 Cue 作者真相

当前由 Script 原生 `||` 提供 Cue break 的方向有明显价值：断句是作者意图，普通构建不应为分 Cue 再调用模型。
但迁移必须明确处理旧 Caption Plan：

- 能无损转成 Script break 的，应写回唯一作者真相；
- 不能等价转换的，应明确产生待人工处理的迁移诊断；
- 不得把旧 plan JSON 静默留在项目中；
- 不得在 Caption 组件内部恢复隐藏 Planner 或模型调用。

Word importance、dual-font emphasis 等确实需要逐词/范围标注时，也必须由显式 Script 属性、Selection 或独立
作者包提供，不能混回普通 Fine Caption 的隐藏规划。

## 七、时间消费协议

### 7.1 已经确认的正确边界

选择、投影、消费必须继续分离：

```text
Selection / Moment / Segment / Program
  -> TemporalWindow / TemporalInstant
  -> 领域组件消费
```

SVML 在组件入口前完成投影。组件不重新读取 Selection，不根据文字或素材偷偷找帧。Studio 从真实执行谱系反向
修改 Selection/Moment 或显式 Window Source，而不是修改匿名结果矩形。

Media 的 enter/exit 在自己的显式 Window 内运行是合理的。若作者希望一个 Media Item 在口播 Selection 前
提前入场，作者应把 Window 明确投影为 `selection.start - duration`，而不是让 Media 组件隐藏扩窗。

Screen Overlay 的 attack/hold/decay、Media 的 occupancy、Sequence Handoff、Audio 的 sampling/fade，也都应继续
作为各自窗口内的领域消费，不变成第三套时间起止。

### 7.2 Caption 缺少的可见时间包络

Caption 同时依赖语义词时间和自动 Cue，因此需要明确区分：

```text
语义时间：词何时被说出、Karaoke 何时激活
投影时间：Cue 来自哪些语义单元
可见包络：字幕块何时开始出现、何时完全离开
局部动画：在可见包络内怎样入场、响应、退场
```

当前 `cue-enter-frames` 直接占用 Cue 开头帧，第一批词已经开始说时字幕仍在淡入。旧 `enterLead` 的有效语义是
可见包络早于语义开始，而 Karaoke 仍从语义开始算；`maxHold/tail` 则控制语义结束后的短暂可见延续。

后续若恢复这些能力，必须把它们建模为可追踪、可解释的显示包络，不能恢复组件内部隐藏 retime。具体由
Caption Program、投影层还是一个专用 Display Schedule 承担，尚待设计。

## 八、参数暴露与 Studio ABI

### 8.1 当前真实行为

当前官方 Video Adapter 以模块名集中匹配 Track，手写可见参数和时间手势。Studio 参数解析随后：

- 在选中实体对应的 Track 或直接作者子项中定位 Source range；
- 沿固定名称的 `recipe/default/style/appearance/motion/program` 引用寻找 SVS Recipe；
- 只把 Recipe 中已经写出的属性转换为输入框；
- 根据原始文本猜测 number、boolean 或 text；
- 按语言与 Source 文件路径分组。

Media Item 和 Typography Item 因为是 Track 直接作者子项，能够追到 Frame 和 Recipe。Caption Cue 是 Program 派生
对象，不是 Caption Fine Track 的直接作者子项，因此 Cue -> Program -> Style -> Recipe 在第一步就断开，实际
Inspector 中没有 Caption 参数。

### 8.2 即使修复 Caption 身份仍存在的问题

- 只显示已经写出的 Recipe 属性，未写的可选能力不能在 Studio 中新增；
- 没有直接利用组件 Manifest 已声明的枚举、fallback、说明和条件；
- 没有能力领域、可选子页、参数组和依赖显示；
- 没有统一表达重置、采用 fallback、显式写入默认值之间的区别；
- 嵌套作者对象没有统一选中和参数上下文；
- 官方 Adapter 中存在跨多个组件的集中属性全集，第三方组件不能仅靠自身声明得到同等体验；
- 参数行重复 Source 元信息，未选择时又缺少会话信息唯一落点。

### 8.3 必须保持的写回边界

无论未来参数 ABI 怎样设计，以下边界不变：

- 参数必须对应真实 SVML/SVS Source 或明确的只读计算值；
- UI 布局声明不是新的值来源；
- 组件可以声明语义和参数结构，但不能注入任意 DOM、CSS、React 或执行回调；
- Studio 统一拥有控件、视觉、revision、事务、错误和回退；
- 引用关系保持引用，Inspector 不把它偷偷换成匿名字面量；
- `parameter.adjust` 与 `timeline.adjust` 仍是仅有的两个顶层作者操作。

右侧 Inspector 的信息架构问题继续由
[Studio Workspace 与 Inspector 信息架构审计](./studio-workspace-inspector-audit.md) 记录；本文负责补充它依赖的
领域协议和参数可达性前提。

## 九、其他核心协议

### 9.1 Speech/A-roll Presentation

旧 Base/Speech Spine 的视频段可以保存完整 Media Presentation。当前 Speech Track 明确只允许：

```text
SpatialFrame + ContentFit + stacking order
```

它不允许 opacity/filter/backdrop/clip/radius、生命周期动效或段间转场。这是有意缩窄，但不能因为文档写了
“complete visual authority”就当作能力已经等价迁移。

后续必须明确选择一个一致方向：

- Speech Visual 复用到什么程度的完整 Media Presentation；或
- Speech 只负责 Semantic/Audio，A-roll 画面由普通 Media authoring 显式表达。

最终方案要避免 Speech 与 Media 各维护一套相似但不相同的 Fit、Frame 和 Presentation，也不能重新建立特权
Base Track。这个问题属于基础轨道能力，不是可推给用户包的 Ranking 类问题。

### 9.2 Post-composite 与 Surface Transform

当前 `screen-overlay` 正确地只绘制自己拥有的全画布像素，可表达 Flash、Color Wash、Vignette、Scan Lines、
Directional Matte、Whip Veil、Glitch Veil、Grain、Light Leak、Bokeh 和 TV Static。

旧 Screen FX 中需要读取已经合成像素的 Gaussian Blur、Color Adjust、Zoom Blur、Blend 等被删除，因为平级 Track
不能读取 lower composite。这个约束合理，但能力缺口仍然存在。

若产品确实需要这些能力，其诚实形式应是：显式消费一个 Surface/Composition 输入，输出一个新的 Surface，
再由后续装配消费。不能恢复隐藏 adjustment layer、`composite_below` 或按 Track 顺序偷读相邻像素。最终应是
普通可安装包还是 Film/Render 前后的显式转换阶段，尚待真实需求和执行成本验证。

### 9.3 Typography、Audio 与 Composition

Typography 已经提供 Point/Area/Path、fixed/hug、word/grapheme wrap、overflow、max lines、columns、writing mode、
精确字体、丰富 Paint/Box 和 motion，是当前最适合承载共享文字布局与 Paint 的基座。Caption 应复用其稳定原语，
而不是继续平行维护第二套 CSS 语义；这不意味着直接把通用 Typography Track 当成 Caption Track。

Audio 已提供 48kHz 精确采样映射、trim、once/loop/stretch、起止对齐、gain 和 fades。当前没有证据要求恢复隐藏
ducking、自动响度或全局音效；未来若需要，应由显式 Mix/Audio 包承担。

Film/Composition 的平级 Track、绝对 stacking、Canvas 与 ProgramSpace 分离目前成立。缺失的像素变换不应通过破坏
Composition 的平级原则来解决。

## 十、迁移过程的根因

历史迁移清单曾同时把 `base_track`、`subtitle_track` 和 `screen_fx_track` 标为 Complete，又在同一文档中明确写出：

- Caption importance 和随机字号被删除；
- Dual Font 留给未来包；
- Cross-Track mask、adjustment layer 和 Base FX 不兼容；
- VLM 时间/空间解析延期。

这说明当时的 Complete 实际表示“新架构里已有一个替代落点”，而不是“旧生产能力已经逐项对齐”。Caption 与
Media 又分别在一次很大的实现提交中同时完成新设计和旧迁移，导致以下问题没有被独立验收：

- 旧参数有没有新作者表达；
- 参数单位和默认值有没有改变；
- 旧项目数据有没有转成唯一新真相；
- Renderer 是否保持视觉语义；
- Studio 是否能看到并修改全部作者参数；
- 明确删除的能力是否经过产品确认。

今后不再以文件数量、代码行数、测试数量或“新包已经存在”作为迁移完成标准，也不为这份审计增加运行锁、
额外哈希清单、能力摘要文件或 Build 慢操作。

## 十一、稳定原则

后续设计可以改变接口，但不得绕过以下原则：

1. Selection/Moment、Instant/Window 和组件消费继续分离；
2. 组件不得内部重新选择语义或偷找帧；
3. Frame、内容采样和 Paint 外溢保持不同事实；
4. Caption Placement 不应继续只是某个视觉 Style 的副作用；
5. Caption 的词语义时间不能被入退场动画改写；
6. 每个可编辑参数必须能追到唯一作者 Source；
7. Studio 不拥有第二份作者状态，也不从最终像素反推作者意图；
8. 第三方组件通过受控声明接入 Studio，不注入任意 UI；
9. 跨层像素效果必须显式消费 Surface，不读取隐藏 lower composite；
10. 旧能力只能标记为保留、由新结构表达、明确删除或待决，不能笼统写 Complete；
11. Build 关键路径不因 Studio 浏览、迁移清单或视觉验收增加慢操作；
12. 不引入自定义 lock、无用途哈希、垃圾摘要或防御性基础设施。

## 十二、分阶段工作流

下面是任务地图，不是一次提交计划。每个工作流都应单独设计、实现、真实预览和提交。

| 编号 | 工作流 | 当前状态 | 主要前置 |
|---|---|---|---|
| A | 能力对照账本 | 待开始 | 本文审计 |
| B | 空间与 Placement 基座 | 待设计 | A |
| C | 共享文字布局与 Caption family | 待设计 | A、B |
| D | Caption 可见时间包络 | 待设计 | A、C |
| E | 参数与 Studio 声明 ABI | 待设计 | A；B/C 概念稳定 |
| F | Speech/A-roll Presentation | 待设计 | A |
| G | Surface Transform 需求判断 | 待调研 | A、真实广告需求 |
| H | 真实项目迁移与验收 | 待开始 | 对应协议工作流完成 |

状态只在对应工作流经过单独设计确认或真实实施后更新，不因相邻任务完成而批量标记。

### A. 建立能力对照账本

目标：把旧协议从“印象”变成逐字段可审计事实。

任务：

- 对 Media、Caption、Speech Visual、Screen FX、Typography、Audio 分别列出旧作者字段；
- 为每项标记当前 SVML/SVS 表达、消费实现、Renderer 与 Studio 可达性；
- 只允许“保留、由新结构表达、明确删除、待决”四种状态；
- 记录单位、默认值、作用域和作者层级变化；
- 把 Hero 等旧项目中的真实值映射进表中验证，而不是只比较类型定义。

完成条件：任何一个旧字段都能解释现在由谁拥有、怎样执行、怎样编辑，或为什么明确不再支持。

### B. 空间与 Placement 基座

目标：确定 Media、Caption、Typography 和普通组件共享的空间事实与领域差异。

任务：

- 审定 Placement Frame、ContentFit、Paint bounds 和视觉外溢的职责；
- 设计 Caption 静态 Region 与 Style 的正交关系；
- 定义可被 Studio 画布手势安全反解的最小几何集合；
- 明确 off-canvas 是合法创作还是无效输入的判断边界，避免一刀切拒绝；
- 决定语义空间解析的显式输入/输出边界。

完成条件：Hero 的几何错误能在作者语义和 Studio 中被直接解释，且无需 Caption 私有影子坐标。

### C. 共享文字布局与 Caption family

目标：保留 Caption 的语义与 Karaoke 特性，同时复用可靠的 Typography/Visual Text 基座。

任务：

- 盘点可直接复用的 Text Flow、Paint、Font、Box 和 Motion 原语；
- 恢复范围盒、像素换行、长词处理、安全区和必要布局约束；
- 决定 Fine、Importance、Dual Font 的作者边界；
- 明确 Cue、Word、Line 和 Style 的身份与作用域；
- 审计 backdrop、glow spread、逐词字体/字号等缺口是否属于首批真实需求；
- 保留 outside stroke 的准确渲染，不把 renderer workaround 暴露成错误作者概念。

完成条件：旧高价值字幕配方能由公开参数重建；Caption 与 Typography 不再拥有两套漂移的排版语义。

### D. Caption 可见时间包络

目标：明确语义词时间、Cue 投影、可见持续时间和局部动效之间的关系。

任务：

- 为 enter lead、tail/max hold、strict timing 建立明确语义；
- 保证 Karaoke/Active Word 继续使用原始词时间；
- 确定包络越过 Segment/Program 边界时的合法行为；
- 确定相邻 Cue 包络重叠时的绘制和交接原则；
- 让 Studio 能解释逻辑 span 与 visible span，而不开放派生帧直接写回。

完成条件：入场不再吞掉第一个词，短尾不污染词时间，所有扩窗都能追溯到公开作者规则。

### E. 参数与 Studio 声明 ABI

目标：组件声明完整参数树，Studio 统一展示和执行写回。

任务：

- 让参数来源建立在包声明和真实作者引用图上，而非固定引用名与集中属性全集；
- 表达能力领域、可选子页、参数组、顺序、控件、单位、枚举、fallback 与条件；
- 区分“采用 fallback”“显式写入值”“删除覆盖”“恢复配方”；
- 让派生 Caption Cue 追到 Program/Style/Recipe；
- 定义 Layer、Keyframe、Member、Handoff 等嵌套作者实体的选择和 Inspector 上下文；
- 保持 `parameter.adjust` 的 Source range、revision 和事务语义；
- 验证项目本地组件无需修改 Studio 核心即可得到同等参数组织能力。

完成条件：组件支持的可调参数没有只能由手写源码访问的隐藏项；未写可选参数可被合法添加；Studio 不需要按
模块名积累无边界分支。

### F. Speech/A-roll Presentation

目标：消除 Speech Visual 与 Media Presentation 的半重复状态。

任务：

- 用真实 talking-head、street interview、podcast 项目盘点 A-roll 所需空间、滤镜、背景和转场；
- 比较“Speech 复用完整 Media Presentation”和“Speech 只产语义/音频、画面用 Media”两种方向；
- 保证 Speech Segment 的时长权威、音频主干和画面表现仍然分离；
- 不恢复 privileged Base Track 或隐藏全局效果。

完成条件：基础 A-roll 能使用与普通 Media 一致的高价值呈现能力，且只有一份 Frame/Fit/Presentation 语义。

### G. Surface Transform 与最终画面效果

目标：在不破坏 peer Track 原则的前提下，决定是否恢复真正需要的 post-composite 能力。

任务：

- 从真实广告样片统计 Gaussian Blur、Color Adjust、Zoom Blur、Blend 等需求；
- 区分可由自绘 Overlay 达成的效果与必须读取输入像素的效果；
- 评估显式 Surface/Composition transform 对预览、渲染和性能的影响；
- 明确其作者 Source、时间输入、Studio 参数和依赖谱系；
- 不让转换读取相邻 Track、隐含层顺序或未声明 lower composite。

完成条件：需要输入像素的效果具有真实图边和明确成本；不需要时不为架构完整感预建抽象。

### H. 真实项目迁移与验收

目标：证明协议能服务 0-1 调样和 1-100 批量生产，而不只在孤立单元中成立。

至少覆盖：

- Hero Meme 的字幕空间、Cue 和参数可达性；
- 多层 B-roll、contain+blur backing、Sampling Motion 与 Sequence；
- Talking-head、Street Interview 与 Podcast 的 Speech/A-roll；
- Fine、Word Importance、Dual Font 三类字幕；
- Selection 驱动的时间拖动及同 Selection 多消费者联动；
- 项目本地组件和 Windows 路径/CRLF；
- Studio 满足 Candidate，绝不触发 Provider 或占位。

完成条件：同一 SVML/SVS 在 Preview、Studio 和最终 Build 中语义一致；一个确认后的范例能不改基础协议地用于
后续批量生产。

## 十三、建议处理顺序

任务间存在真实依赖，推荐按以下顺序逐项推进，但每一项开始前仍需单独确认设计：

```text
A 能力账本
  -> B 空间基座
  -> C 共享文字与 Caption family
  -> D Caption 可见时间包络
  -> E 参数与 Studio ABI
  -> H 真实项目迁移验收

A 能力账本
  -> F Speech/A-roll Presentation
  -> H 真实项目迁移验收

A 能力账本
  -> G Surface Transform 需求判断
  -> H 真实项目迁移验收
```

E 可以在 B/C 的概念稳定后并行设计，但不应先围绕当前错误 Caption 结构扩展一套永久参数协议。G 的优先级低于
Caption 和 Speech 基础；只有真实广告需求证明它值得时才进入实现。

## 十四、本轮明确不做

- 不修改 Hero 项目或任何运行代码；
- 不为审计新增测试矩阵、截图基线或迁移脚本；
- 不恢复旧 Twinit 的中心 JSON DAG、Canvas 数据库或节点工作台；
- 不重新引入 Caption 隐藏 Planner、VLM 猜测或 Runtime creative fallback；
- 不把 Ranking 等预制用户包的专有交互混入基础协议；
- 不用运行锁、内容哈希、摘要清单或新缓存来管理迁移；
- 不一次性重构所有 Track；
- 不因为某能力理论上完整就先实现，优先由真实广告制作需求排序。

## 十五、审计证据

当前仓库主要证据：

- `packages/spatial/`：Canvas、Frame、Path、Extent 与 ContentFit；
- `packages/media-track/`：Layer、Presentation、Occupancy、Lifecycle、Sampling、Sequence 与 Sound；
- `packages/caption/`：CaptionDocument、Selection 投影、Style 分配与 Cue 作者边界；
- `packages/caption-fine/`：Fine Caption 参数、校验与 Visual IR lowering；
- `packages/typography-track/`：共享文字布局、Paint、Font、Box 与 Motion；
- `packages/temporal/`：Instant/Window 的显式投影；
- `packages/speech-track/`：受限 Speech Visual authority；
- `packages/screen-overlay/`：自包含全画布 Overlay；
- `packages/studio*`：实体投影、参数可达性、时间谱系和作者写回。

历史 Twinit 审计来自旧 checkout 中的 Subtitle Track、Base Track、B-roll Track、Text Track、Screen FX Track、
Audio Track 文档及对应 Remotion/engine 实现。它们只作为迁移事实来源，不成为 Hypit 的运行依赖或需要保留的旧 API。

Hero Meme 审计来自本机 2026-08-22 项目快照的 `main.svml`、`recipes.svs`、`studio.svrun` 和失效的
`studio-caption-plan.json`，并通过真实 Studio/HyperFrames DOM 几何验证。后续若把 Hero 固化为仓库示例，应另行
选择可公开素材和稳定的项目夹具；本文不复制其生成素材或 Runtime 状态。
