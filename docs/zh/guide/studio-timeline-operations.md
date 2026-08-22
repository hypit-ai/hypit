---
title: Studio 时间线操作与写回边界
description: 时间线中的每一种操作如何映射到 Studio 会话、SVML、SVS、SVRun，或被明确禁止。
---

# Studio 时间线操作与写回边界

> 状态：第一版写回已落地。时间线的结构性拖动仍按本文边界保持禁用；右侧参数面板已支持
> 适配器明确声明的 SVML 字面量、被引用的 Frame/Extent 字段和已解析的 SVS Recipe 属性，并通过带 preimage 的多文件事务回写。

## 结论

Hypit 不能把传统 NLE 的“拖矩形”直接移植进来。传统 NLE 通常把时间线 Clip 本身当作编辑
真相；Hypit 时间线上的矩形却可能只是 Selection、Segment、Moment、父 Schedule 或绝对点
表达式经过投影后产生的一次消费结果。

这里必须先固定一个前置顺序：选择与投影发生在进入领域组件之前，而不是由组件内部自行
猜测。SVML 负责声明单一语义来源和投影表达式；通用 Temporal 层把它们解析为
确定的投影帧窗；Media、Text、Caption、Ranking 等组件再消费这个投影，并在需要时计算
自己的消费阶段或 schedule。这样时间线矩形始终有公开的来源链：

```text
作者表达式 -> 选择/投影 -> 领域组件 -> 消费窗口 / schedule -> Visual 或 Audio realization
```

因此 Studio 不需要从最终矩形反猜 `Selection`、`Moment` 或 offset。修改语义来源、修改
投影表达式、修改组件消费阶段仍是三种不同操作，必须分别映射到它们各自的作者层级；这条
前置边界解决“组件内部偷偷定位”的歧义，但不允许把领域组件自己的公开排程算法隐藏掉。

因此，任何会改变视频的手势都必须先回答：

1. 用户正在修改语义来源、投影表达式、消费窗口、素材内部时间，还是画面属性？
2. 它唯一对应哪一个作者实体、哪一个文件、哪一段源码？
3. 它写入 SVML、SVS 还是 SVRun？
4. 它是否影响同一来源的其他消费者？
5. 修改后能否在不访问 Provider、不创建 Build 的情况下重新编译和预览？

只要有一个问题没有唯一答案，Studio 就不显示该操作的 affordance。禁止操作优于静默猜测。

## 四个写入目的地

| 目的地 | 它拥有的事实 | 典型操作 |
|---|---|---|
| Studio 会话 | 只影响当前工作台，不改变视频 | 选择、播放、seek、缩放、滚动、折叠、预览静音 |
| SVML Author Source | 视频是什么、图如何连接、语义标记、窗口绑定、内容、空间、Film 组成 | 移动 Selection 标记、修改 `start/end`、换素材引用、改 Frame、增删 Item |
| SVS Recipe Source | 可复用的视觉、运动、转场和排版策略 | 颜色、字号、fit、opacity、blur、进入/退出、transition Recipe |
| SVRun Run Source | 这一次运行生产什么、用哪个明确 Candidate 满足输出 | target、file/build-record/value Candidate、satisfy |

最终 `VisualTrack`、`AudioTrack`、`Composition`、`SemanticTake`、`CaptionDocument`、已接受的 Build
Record 和 HyperFrames DOM 都不是第五种作者源。它们是计算结果，时间线不得直接修改。

## 启用操作的八个条件

一个改变视频的操作只有同时满足以下条件才可以启用：

1. 选中的时间线实体能精确追溯到作者实体，而不是仅有 renderer id。
2. Adapter 能指出准确的可写文件、源码范围和修改前文本。
3. 手势只有一种领域含义，不需要 Studio 在来源、投影与消费之间猜。
4. 修改保持原来的绑定形式；不能把 `during={selection}` 偷换成绝对帧。
5. 共享来源的完整影响范围可列出并展示。
6. 目标包的公开 vocabulary 确实能表示修改后的状态。
7. 修改后的 SVML、SVS、SVRun 可以作为一个整体重新检查和编译。
8. 对应 Adapter 为这个具体实体声明了操作；全局 UI 不按 family 或名字推断。

不满足条件时，Adapter 应返回明确的 disabled reason；UI 不画假把手，也不允许拖完再报错。

## 当前已经存在的操作

### 会话操作

这些操作已经存在或可以安全补齐，因为它们不写作者源：

- 单选、取消选择；源码、画面和时间线共享同一选中身份。
- 点击空白 seek、拖动 scrub、hover 时码。
- 播放、暂停、前后一帧、跳到开头和结尾、预览静音。
- 水平缩放、以播放头或指针为锚缩放、平移、fit、聚焦一个 Segment。
- 折叠重叠行、展开 Adapter 声明的附属 lane。
- 调整时间线高度、各上方面板大小和可见窗口。
- 吸附预览：当前 seek 会吸附 Semantic Anchor 与 Clip 边缘，但吸附本身不写源。

当前源码编辑器和右侧参数面板都走同一个 Source transaction：服务端先检查 snapshot revision、
工作区内允许的 Source 文件、精确 range 和 preimage，再把一组修改写入临时文件并替换，随后
重新编译 SVML 与 SVRun。面板显示每个值的真实语言（SVML/SVS/SVRun）和源码位置；引用关系
本身保持只读，避免把 `during={selection}` 偷换成另一种语义。当前 Run 参数仍以只读候选事实展示，
不会在打开 Studio 时调用 Provider 或猜测新的 Candidate。

## 右侧参数面板的注册规则

参数不是 Studio 按属性名字猜出来的。每个 Studio Adapter 在自己的注册项里声明允许暴露的
属性（`name`、控件类型、单位和是否可写）；Markup 只提供这些属性在源码中的精确 value range。
因此一个参数最终至少包含：

```text
adapter declaration
  -> source language (SVML / SVS / SVRun)
  -> source path + exact range + preimage
  -> writable / disabled reason
```

SVML 的引用（例如 `during={story.selection.claim}` 或 `appearance={recipes.media.card}`）本身
不会被面板换成另一条引用。Studio 会把引用显示为只读来源；如果它指向作者闭包中的 SVS Recipe，
则解析该 Recipe 的属性并把每个 SVS property 的 `valueRange` 作为独立参数。这样改 `radius`、
`fit` 或 `enter-frames` 写回的是 SVS，改 `z` 或显式 SVML 字面量写回的是 SVML，二者不会复制
成第二份真相。

同样，`frame={card-frame}`、`placement={title-frame}` 这类引用不会被替换成匿名的 Studio
矩形；Adapter 可以声明该引用展开哪些字段，面板会直接定位到被引用的 `<space:Frame>` 或
`<space:Extent>` 的原始属性范围。改 `left/top/right/bottom` 仍然是改 SVML 中那个 Frame，
所有共享它的消费者会在重新编译后一起反馈。

当前第一种时间线写回是显式绝对窗口：当一个实体同时声明了可解析的绝对 `start`/`end`
字面量时，Studio 才提供 move、trim-start、trim-end；拖动会把两端作为同一事务改成帧单位，
不会改成另一种 `during` 绑定。`at={moment} for="…"` 只有右端 trim，左端仍由 Moment 决定。
Selection、Segment、Moment 投影和任何组件内部计算出来的窗口没有时间线拖把手；它们只能在
来源参数或源码中修改。这样“有把手”本身就是一条可审计的 source mapping，而不是 CSS 假象。

每个把手的源码绑定带有角色，而不是靠数组位置猜测：`start`、`end` 和 `duration` 分别指向
具体的 SVML value range。Move 必须同时拿到 `start + end`，trim-start 只能拿到 `start`，
`at + for` 的 trim-end 只能拿到 `duration`。右侧面板会同时显示坐标域、吸附目标和这些源码位置；
因此操作完成后可以核对它到底回写了哪一段 SVML。

当前适配器已把基础 Audio、Media、Text、Caption、Ranking 和 Speech Visual 的领域属性接入
参数面板：存在于作者源码的 SVML 字面量可写；引用的 Frame/Extent 字段直接展开到它们自己的
SVML 定义；引用的 SVS Recipe 属性直接写回 `.svs`。没有实际出现的属性不会凭空出现在面板中，
SVRun 的 target/Candidate 只作为本次运行事实展示，不在 Studio 打开时被改写或重新请求 Provider。

### 当前没有实现的操作

`StudioInteraction` 仍然只描述基础选择行为；`StudioEditHandle` 现在由 Adapter 的
`editOperations` 声明和源码参数共同生成，包含坐标域、吸附策略、源码范围和 disabled reason。
因此同一个 Media Track 中，绝对 `start/end` 可以有 move/trim 把手，而 `during={selection}`
的同形矩形只会得到明确的禁用原因。参数面板的单值修改和被引用 Frame/SVS 字段修改都走同一
个可逆、可验证的作者写回。

## 成熟 NLE 给出的操作词汇

CapCut 提供面向单个 Clip 的 split、trim、speed、transition、effect、keyframe/curve；Premiere
和 DaVinci Resolve 进一步区分 insert、overwrite、ripple、roll、slip、slide、lift、extract、
track targeting 与 snapping；After Effects 把 Layer 的 In/Out、属性关键帧、time stretch、
time remap、freeze/reverse 和子属性展开当作主要时间操作。

这些产品提供的是需要审计的“操作词汇”，不是 Hypit 可以照搬的语义。尤其是 ripple、roll、
slide、insert 和 overwrite，都预设相邻 Clip 构成一个可破坏编辑的序列。Hypit 的 Film Track
是平等输入，Visual Present 的 z 也是 item 自己的事实；时间线行顺序和左右邻接都不具备这个
含义。

官方参考：

- [CapCut Desktop](https://www.capcut.com/tools/desktop-video-editor)
- [Premiere：Ripple Edit](https://helpx.adobe.com/premiere/desktop/edit-projects/trim-clips/perform-ripple-edits.html)
- [Premiere：Rolling Edit](https://helpx.adobe.com/premiere/desktop/edit-projects/trim-clips/perform-rolling-edits.html)
- [Premiere：Slip Edit](https://helpx.adobe.com/premiere/desktop/edit-projects/trim-clips/perform-slip-edits.html)
- [Premiere：Slide Edit](https://helpx.adobe.com/premiere/desktop/edit-projects/trim-clips/perform-slide-edits.html)
- [Premiere：Snapping](https://helpx.adobe.com/premiere/desktop/edit-projects/change-clip-sequence/snap-clips.html)
- [DaVinci Resolve Edit](https://www.blackmagicdesign.com/products/davinciresolve/edit)
- [After Effects：Time Stretch 与 Time Remap](https://helpx.adobe.com/after-effects/desktop/animate-in-after-effects/time-stretching-and-time-remapping/time-stretching-time-remapping.html)

## 时间操作首先选择层级

### 1. 编辑语义来源

这是修改 Script 中的 Selection 或 Moment，不是移动下游 Clip。

| 操作 | 写入 | 规则 |
|---|---|---|
| 移动 Selection 起点或终点 | SVML Script marker | 只能吸附语义 Anchor；列出所有消费者 |
| 整体移动一个 Selection | SVML Script marker | 同时移动两个 marker；不能跨越无法保持 Script 结构的位置 |
| 移动 Moment | SVML Script marker | Moment 仍是点；所有消费者一起更新 |
| 拖动 Segment 边界 | 禁止 | 等价于在两个结构化 Segment 间搬运文本，普通拖边没有唯一语义 |
| 拖动一个词的声学起止帧 | 禁止 | 词窗属于 SemanticTake 计算结果，不是 Author Source |

语义来源操作必须在明确的“编辑来源”层级发生。不能从任意 B-roll 矩形的边缘拖动，静默改掉
一个被 Caption、Text 和 Ranking 共同使用的 Selection。

### 2. 编辑投影表达式

| 原作者形式 | 可行操作 | 写入 |
|---|---|---|
| `during="program"` | 不可 move/trim | Program 是完整时域 |
| `during={selection}` / `during={segment}` | 普通 item move/trim 禁止 | 若要改变，进入“编辑来源”修改 marker |
| `at={moment} for="12f"` | 只允许拖右边修改 `for` | SVML；左边由 Moment 决定 |
| `start="selection.start+3f" end="selection.end-2f"` | 两端分别修改各自 offset；整体拖动同时加同一 delta | SVML；保留两个原 point expression |
| 绝对 `start/end` | move 与两端 trim | SVML；保持原 duration 单位或明确改成 frame |

给 `selection.start` 增加 `+3f` 仍然是同一种 point-expression 绑定，可以写回；把
`during={selection}` 改成两个绝对帧则不是，必须禁止。

### 3. 编辑消费窗口

消费窗口只有领域组件能解释：Media Sequence 有 logical/visual/handoff spans，Ranking 有
preferred/active/settled，motion 有 enter/body/exit。Studio 不提供通用的“拖消费窗口”能力。

只有当 Adapter 能指出一个公开的作者参数直接控制该消费阶段时，才暴露专属把手。例如：

- Audio 的 fade-in/fade-out 写 SVML 属性。
- Media Sequence 的 Handoff duration 写 Transition Recipe。
- Ranking `active`/`settled` 是 Schedule 计算结果，目前只读；不能拖它们反猜 Selection。

## 通用 NLE 操作判定

| 操作 | Hypit 判定 | 原因或写入 |
|---|---|---|
| Select / multi-select | 会话允许 | 不修改视频；多选只是后续事务的输入 |
| Seek / scrub / shuttle / frame step | 会话允许 | 只改播放头 |
| Mark In/Out / loop range | 会话允许 | 明确称为预览范围；除非用户另行执行作者化命令，否则不写 Script marker |
| Zoom / pan / fit | 会话允许 | 只改时间线视口 |
| Snapping 开关 | 会话允许 | 每个编辑 handle 声明可吸附的坐标域 |
| Move Clip | 条件允许 | 只对可逆投影表达式或绝对窗口；不能泛化 |
| Trim edge | 条件允许 | 修改对应投影端点或 Moment 的 `for`；不自动改素材 trim |
| Slip | 领域允许 | 目标窗口不变，修改 timed source 的内部 trim |
| Slide | 默认禁止 | 需要同时修改左右邻居，Track 邻接不是作者关系 |
| Ripple trim/delete | 默认禁止 | 右侧矩形不是一个可整体推移的序列 |
| Rolling edit | 默认禁止 | 只有显式 Sequence/Handoff Adapter 可以定义共享边界版本 |
| Razor / Split | 默认禁止 | 一个投影矩形不一定能合法复制成两个作者实体 |
| Insert / Overwrite / Ripple overwrite | 禁止通用实现 | Film 不是一条破坏性主时间线，没有 track targeting 语义 |
| Lift / Extract | 禁止通用实现 | 删除矩形与关闭语义时间没有统一关系 |
| Copy / Paste / Duplicate | Adapter 专属 | 必须生成新 id，并完整决定引用、窗口和插入位置 |
| Delete | Adapter 专属 | 只能删除精确的一对一作者实体 |
| Add Track / Item | Adapter 专属 | 必须收齐 source、timing、placement、style，不能只凭落点猜 |
| Link / Unlink A/V | 默认禁止 | 同源 facet 是否可分离由领域模型决定；Speech 三 facet 不能漂移 |
| Track mute / solo / lock | 仅会话预览 | 必须明确标为 Preview；最终 Film 不因此改变 |
| Enable / disable / bypass item | 默认禁止 | 当前没有跨 Track 通用的 authored enabled 状态，不能把预览隐藏写回视频 |
| Include / exclude from Film | SVML 显式操作 | 增删 `<film:Track>`，不是 mute 按钮的隐藏副作用 |
| Reorder timeline rows | 会话或组织操作 | Film child order 不是 z；不得让用户误以为改变合成顺序 |
| Change z / stacking | 领域属性 | 修改 item Recipe 或明确的 `z` 属性，不使用 lane 顺序 |
| Transition | 只对公开 Handoff | Media Sequence 的 Handoff 结构写 SVML，Transition Recipe 写 SVS |
| Adjustment layer / effect track | 当前禁止 | 现有 vocabulary 没有这一作者实体，不能用兄弟 Track 冒充 |
| Nest / precompose | 当前禁止 | 需要公开的组合作者模型，不能只改 UI 分组 |
| Speed / reverse / freeze / speed ramp | 按 vocabulary 分开 | 只支持已有 occupancy/stretch；无通用 time-remap 时不得伪造 |
| Replace / relink media | 条件允许 | Author edge 改 SVML；同一输出换 Candidate 改 SVRun；两者必须分成两个命令 |
| Proxy / preview quality | 会话或运行层 | 不能改变作者图；若以后有代理 Candidate，它仍是明确的 SVRun 决策 |
| Rename | 条件允许 | 改可见正文/label 是普通作者属性；改 `id` 是引用感知的全图重构，不能只改标签文本 |

## 各 Track Family 的具体操作

### Speech / Semantic Track

允许：

- 选择 Segment、点击词 seek、播放、缩放。
- 编辑 Script 文本、Dual Text、Selection 和 Moment；写 SVML。
- 修改 Speech visual Frame 引用或 Frame 的空间参数；写 SVML。
- 修改 visual fit Recipe；写 SVS。
- 修改 Track/Take 明确的 `visual-z` / `z`；写 SVML。

禁止：

- 直接移动、裁短、切开、删除一个 SemanticTake 时间块。
- 独立移动 Speech visual 或 audio facet。
- 拖动词窗来“修 WhisperX”。词窗是 Candidate 内的测量结果。
- 用 J/L cut 让 Speech picture、voice 和 semantic 三者漂移。

Take 顺序和时长定义全局 SemanticTrack。修改它们会重写所有下游帧坐标，不能伪装成普通
Clip 编辑；应通过 Script/Take 作者结构和新的语义 Candidate 明确完成。

### Media Track

允许的精确操作：

- 按前述投影规则 move/trim Item 的目标窗口；写 SVML。
- Slip timed media：目标窗口不变，同时移动 `trim-start` 与 `trim-end`。Media 的 trim 当前属于
  appearance Recipe，因此写 SVS；若 Recipe 被共享，必须显示全部受影响 item，不能自动复制。
- 修改 source 引用、`source-audio`、`audio-gain`；写 SVML。
- 修改 Frame/Point/Path：保持 `Frame`、`AnchoredFrame`、`AspectFrame` 原 Surface 和原单位，写 SVML。
- 修改 fit、focal point、opacity、blur、brightness、contrast、saturation、clip、border、shadow；写 SVS。
- 修改 enter/sustain/exit；写 motion Recipe（SVS）。
- 修改 `<Sampling>` 的 zoom/x/y/rotate keyframe；写 SVML。
- 修改 stack-order；写引用的 appearance Recipe（SVS），并展示共享影响。

条件或禁止：

- 静态图没有 slip、speed 或 source trim。
- Resize 目标窗口不会自动改 source trim 或 playback；这是三种不同操作。
- Split 只可能由 Media Adapter 对绝对/可拆投影提供结构化写回；第一版禁止。
- Sequence Member 的 roll 只能修改它公开的 activation source；如果来源是共享 Moment/Selection，
  必须进入来源编辑。普通 Clip 间不提供 roll。
- 转场只存在于 Sequence 的 `<Handoff>`；不能在两个独立 Item 交界处拖出一个隐式 crossfade。

### Audio Track

允许：

- 按投影形式 move/trim 目标窗口；写 SVML。
- Slip source，修改 `trim-start`/`trim-end`；写 SVML。
- 修改 playback、min/max-rate、gain、fade-in、fade-out；写 SVML。
- 换成另一个已经存在的 `SynchronizedMedia` 引用；写 SVML。

禁止：

- 当前没有音量自动化曲线、pan、EQ 或任意 speed ramp 作者模型，不能画可拖的线。
- 与 Speech 同源的 voice 不能脱离 SemanticTake 独立 trim。
- 波形是预览，不是可以写回的音频数据。

### Text Track

允许：

- 按投影形式 move/trim；写 SVML。
- 编辑直接正文或 `content` 引用的源 Text；写对应 SVML 作者实体。
- 移动 Point、Frame、Path，或在预览画面中变换可追溯且可写的 placement；写 SVML。
- 修改 Style 的字体、Paint、Box、排版与 stack-order；写 SVS 或 Style 所属 SVML，取决于该字段
  的真实作者位置。
- 编辑 `ItemKeyframe`、document Sequence keyframes 与 `PathKeyframe`；写 SVML。

禁止：

- 拖最终 glyph box 反猜它来自 Point、Area 还是 Path。
- 一个共享 Style 被多个 item 使用时静默只改变当前 item。
- 把最终 layout 行断点或 glyph 坐标写回作者文本。

### Caption Track

允许：

- 选择 Cue、seek、查看对应 Script Atom/Word。
- 修改字幕显示文本时，回写 Script 的 caption 侧或 Dual Text 左侧；写 SVML。
- 修改 Caption Style、位置、字体、颜色、描边、背景、karaoke、固定 enter/exit 参数；写 SVS。

当前禁止：

- move/trim 一个 Cue。
- 在时间线 split/merge Cue。
- 拖 Word 的时间边界。

Cue 分组属于 Script 的 `CaptionDocument`：Segment、Role、Style 变化和作者写出的 `||` 都是
可追溯的作者事实。Studio 当前只读显示；未来若启用 split/merge，应回写 Script 中的 `||`，
绝不能把 cue boundary 偷塞进 SVRun `<value>`。

### Ranking 与其他组件 Track

Ranking Column 的操作层级必须保持：

- 父 item 是 Column 的 outer window。
- 非 preset 子项的 Selection 是 preferred 投影来源。
- `active`、`settled` 是 Schedule 计算的消费阶段。

允许：

- 修改父 `during` 指向的 Selection/Segment，使用来源编辑；写 Script SVML。
- 修改 reveal Selection marker，使用来源编辑；写 Script SVML。
- 修改 rank、preset、label、icon 等明确属性；写 SVML。
- 修改 Frame、stage 参数与 Style；按真实字段写 SVML 或 SVS。

禁止：

- 直接拖 `active` 或 `settled` 阶段。
- 根据最终非重叠区间反推并覆盖原 Selection。
- 让 Studio 重跑 Ranking 的避让算法；它只读取公开 Schedule。

其他组件默认只读。只有自己的 Companion Adapter 能声明其父窗口、子窗口、内部阶段和可逆作者
参数，通用 Visual fallback 永远不获得写回能力。

## 空间、画布与 Inspector 操作

预览区的拖动不是“改最终 bounding box”，而是编辑一个空间作者值：

| 来源 | 可写方式 |
|---|---|
| `space:Frame` | 修改 left/top/right/bottom，保持 px 或 % 单位 |
| `space:AnchoredFrame` | 修改 x/y/width/height/offset，保持 anchor |
| `space:AspectFrame` | 修改 x/y 与作者选择的 width 或 height，保持 aspect 和 anchor |
| `space:Point` | 修改 x/y |
| `space:Path` | 修改明确的命令点与控制点 |
| imported、derived 或无法定位的 geometry | 禁止画布拖动 |

若 Frame 被多个 item 共享，拖动前显示所有消费者。Studio 不自动克隆 Frame 来制造“只改当前
item”的错觉。

## Keyframe、Motion 与时间重映射

AE/Resolve 的时间线会把任意属性展开成关键帧，但 Hypit 只展示公开作者模型已经支持的曲线：

| 能力 | 当前作者模型 | 判定 |
|---|---|---|
| Media source pan/zoom/rotate | `<Sampling>` | 可编辑，SVML |
| Text transform/opacity/blur/color/clip | `<text:Motion>` keyframes | 可编辑，SVML |
| Text per-unit stagger | Motion Sequence | 可编辑，SVML |
| Media enter/sustain/exit | motion Recipe | 可编辑，SVS；不是任意曲线 |
| Caption enter/exit/active response | Caption Recipe | 可编辑，SVS；不是任意 Cue keyframe |
| Audio gain/fade | Clip attributes | 可编辑，SVML；当前无 automation curve |
| Media playback occupancy | once/hold/loop/stretch | 可编辑，SVS |
| 任意 reverse/freeze/time-remap/speed ramp | 无通用模型 | 禁止 |

Studio 不能因为 UI 会画菱形，就声称任意字段支持关键帧。Adapter 必须提供关键帧集合的身份、
时间坐标、值 schema 和精确的增删改写回。

## SVRun 只接受运行决策

时间线几何操作永远不写 SVRun。下列操作可以写 SVRun，但应放在 Workspace/Material/Run 控件，
而不是伪装成普通 Clip 拖动：

- 为已有 Logical Output 选择一个 `<file>` Candidate。
- 选择历史 `<build-record>` Candidate。
- 增删或替换 `<satisfy>`。
- 增删 Build target。
- 选择一个确定性 Fragment Candidate。

两种“换素材”必须区分：

1. 把 Media Item 的 source edge 改接到另一个 Author Graph 输出：写 SVML。
2. 保持同一个逻辑输出，改变这次 Run 用什么 Candidate 满足它：写 SVRun。

从系统外直接拖一个文件进时间线，还包含“素材导入/复制到项目”的文件系统操作，不属于本文
三种语言。第一版应禁止；只有文件已经作为项目输出或 Run Candidate 明确存在后才能选择。

Studio 打开和重编译永远不调用 Provider，也不自动创建 Build。若一个编辑会引入新的外部 Need，
第一版应在提交前禁用并说明缺少 Candidate，而不是提交后偷偷生成素材。

## 结构操作

### Add

“在这里加一个 item”不是只有一个时间点。Adapter 必须收齐：

- 放进哪个作者 Track；
- 使用哪个 source；
- 使用哪种时间绑定；
- 使用哪个 Frame/Point/Path；
- 使用哪个 Style/Motion；
- 新 id；
- 是否需要一个已存在的 Run Candidate。

未收齐时 Drop 只能打开创建表单，不能立刻写源。

### Delete

只对一对一作者实体允许。删除前必须列出：

- 被删除的 SVML 元素；
- Film 或其他引用是否也要一起删除；
- Track 是否因此违反最小 child 数；
- 是否会留下无消费者的作者节点。

CaptionDocument 的一个 Cue、Ranking 的一个 active phase 都不能使用通用 Delete。

### Duplicate / Copy / Paste

只有 Adapter 能生成合法的新作者 id、复制完整子树并要求用户选择新的时间绑定时才允许。
复制最终 Clip DTO 或 renderer Present 没有意义。

### Rename

NLE 中的“重命名 Clip”通常只改素材显示名；Hypit 需要把三件事分开：

- 修改画面上真正出现的 label/copy：写拥有这段内容的 SVML 作者实体。
- 修改 Studio 里的临时别名：只属于会话，但当前不应增加这类双重命名。
- 修改作者 `id`：这是跨闭包的引用重构，必须同时更新所有 `{id.port}`、Film 引用、SVRun output
  名称和 Candidate satisfaction；在编译器能提供完整引用 source range 前禁止。

### Undo / Redo

Undo/Redo 必须撤销“Source transaction”，而不是恢复一份浏览器 JSON：

- 一个事务可以同时修改 SVML、SVS、SVRun 多个文件。
- 每个 patch 保存精确 preimage、postimage、文件 revision。
- 外部编辑使 preimage 不再匹配时，撤销栈停止并要求重新解析，不能静默三方合并。
- Undo 不撤销 Build，也不删除已经产生的外部 Artifact。

## Adapter 操作协议需要重构

当前布尔协议不足以表达同一 Media Track 中 `program` item、Selection item、Moment item、静态图
和 timed video 的不同权限。操作必须下沉到每个投影实体的具体 handle。

建议形状：

```ts
type StudioEditHandle = {
  readonly id: string;
  readonly gesture:
    | "move" | "trim-start" | "trim-end" | "slip"
    | "canvas-move" | "canvas-resize"
    | "delete" | "duplicate" | "edit-keyframes";
  readonly coordinate:
    | "semantic-anchor" | "program-frame" | "source-frame"
    | "canvas-pixel" | "normalized-progress";
  readonly snapTo: readonly ("frame" | "semantic-anchor" | "item-edge")[];
  readonly writes: readonly {
    readonly language: "svml" | "svs" | "svrun";
    readonly file: string;
    readonly range: Range;
  }[];
  readonly impact: readonly {
    readonly authorId: string;
    readonly entityIds: readonly string[];
  }[];
  readonly disabledReason?: string;
};

type StudioMutationPlan = {
  readonly operationId: string;
  readonly patches: readonly SourcePatch[];
  readonly affectedEntities: readonly string[];
  readonly requiresExternalBuild: boolean;
};
```

真实协议不必照抄字段名，但必须表达相同事实。一个粗粒度 `move: true` 不再合格。

### Adapter 负责

- 判断这个具体实体拥有哪些操作。
- 把手势解释成领域修改。
- 找到作者文件和源码范围。
- 生成精确、最小的候选 patch。
- 声明共享影响、合法吸附域与禁用原因。

### Studio 中心层负责

- pointer、键盘、吸附、ghost、把手和统一手感。
- 把屏幕坐标变换成 Adapter 声明的坐标域。
- 显示影响范围，不让 Adapter 自己画任意 UI。
- 校验 patch 只触及允许的 workspace Source。
- 做并发检查、暂存编译、原子提交、Undo/Redo。
- 重新载入 Snapshot，并用稳定 author identity 保持选中。

## 写回事务

一次时间线操作的完整过程应当是：

```text
pointer gesture
  -> Studio 找到实体上的精确 edit handle
  -> 中心层按 handle 的坐标域和 snap policy 得到 intent
  -> Adapter 将 intent 解析为 mutation plan
  -> Studio 展示 ghost 与共享影响
  -> 在内存中同时应用 SVML/SVS/SVRun patches
  -> check + compile + plan（不运行 Provider，不创建 Build）
  -> 成功后按 revision 原子写文件
  -> 重新得到 Snapshot 与 HyperFrames preview
```

人类、Agent 和外部编辑器平等使用同一份 Source。不要使用长期文件锁；使用乐观并发：每个 patch
携带修改前文本和 revision，任何一个文件已变化就拒绝整个事务并重新规划。绝不部分提交，绝不
静默覆盖。

当前 `PUT /__studio/source` 会先写完整 Author Source 再编译，只能处理一个文件。实现时间线写回
前，需要先替换为上述多文件暂存事务；否则 SVS/SVRun 操作、原子 Undo 和人机并发都不成立。

## 第一阶段建议启用的操作

先实现闭包最小、可逆且不会创造新外部 Need 的操作：

1. 完整的多文件 Source transaction、revision 检查和 Undo/Redo。
2. Selection/Moment marker 的显式语义编辑，含消费者影响预览。
3. `start/end` point expression 的端点 offset；绝对窗口 move/trim；`at+for` 的右 trim。
4. Audio Clip slip、gain、fade 与 occupancy。
5. Media timed source slip、现有 SVS appearance/motion 属性。
6. 独占且本地可写 Frame/Point 的画布 move/resize。
7. Text Motion 与 Media Sampling 已存在 keyframe 的时间和值编辑。

第一阶段继续禁止：创建、删除、split、ripple、roll、slide、insert/overwrite、Caption Cue 编辑、
Speech Take 编辑、Ranking 消费阶段编辑、外部文件拖入和任何会要求 Provider 的操作。

## 最终原则

Hypit Studio 的优势不是把所有矩形都变成可拖，而是能让人看到并精确修改矩形背后的作者关系。

- 语义来源是语义来源。
- 投影表达式是投影表达式。
- 素材内部 trim 是素材内部 trim。
- 消费 Schedule 是领域组件的结果。
- SVRun 只决定本次运行如何满足图。

一个操作如果不能诚实地保持这些区别，就不属于 Studio 时间线。
