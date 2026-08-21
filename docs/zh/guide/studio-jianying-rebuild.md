# Studio 剪映级视觉重构规格

> 状态：已实现并通过真实 Run 验收
> 唯一视觉基线：`~/Downloads/截屏2026-08-21 02.42.16.png`（2048×1174，剪映桌面端）
> 范围：`packages/studio`；不改变 Core、作者包或 SVML 语义

## 目标

Studio 不再只是一个“深色开发者工具”，而要在布局、密度、层级、配色、控件尺寸、时间线手感和选中反馈上完整复现参考图中的剪映。这不是“借鉴风格”，而是以参考图为像素级几何和视觉标准。

Hypit 与剪映的功能不同，因此只允许下列必要替换：

- 剪映左上素材区 → Hypit 工作区，可切换 SVML、本地文件、任务和产物。第一版默认是 SVML。
- 剪映中上播放器 → HyperFrames 实时画面。
- 剪映右上参数面板 → 当前选中实体的 Inspector。
- 剪映下方时间线 → Hypit 语义/帧双时基时间线。

除这四处产品语义替换外，不得自由发明新的视觉语言。

## 参考图的硬几何

- 应用顶栏约 `36px`，低对比近黑背景。
- 上半区为左、中、右三列，下半区为通栏时间线。
- 上半区约占可用高度 `52–56%`，时间线约占 `44–48%`。
- 左列约占宽度 `34%`，中列约 `43%`，右列约 `23%`；面板必须可拖动调整，但初始值必须与参考图一致。
- 面板之间使用 `8px` 暗沟，而不是多重边框。
- 面板顶部工具栏高度统一，不允许每个面板各自发明一套高度。
- 时间线由三层构成：单行工具栏、单行标尺、紧凑的 Track 区。标尺和 Track 必须使用同一水平坐标系。
- 左侧 Track Header 为固定宽度，右侧内容水平滚动；两者纵向只有一个滚动真相。表头列是隐形分栏，不画独立 panel 边框；每一行左右两块共享同一高度和边界。

## 配色与排版纪律

- 使用剪映的中性灰层级：应用背景、面板背景、悬浮/选中背景。不使用大面积渐变、玻璃拟态或带色半透明底。
- 品牌色只负责应用外壳交互：当前工具、焦点、caret 和按钮状态使用同一组可替换的品牌 ramp。Logo 原色是 `#ed98b9`，实际交互使用更深、更高彩度的 `#e573a3`；时间线选中框、播放头和投影不消费品牌色。
- Track family 颜色只负责数据编码，必须主动拉开色相距离，不能再沿品牌粉色挤成一团。lane、面板、标尺与空白区域保持近黑中性。
- 正文与数字使用系统 UI 字体；源码使用等宽字体。时码必须使用 tabular numerals。
- 不得出现低于 `11px` 的信息文字；不使用奇怪的半档字号和任意字重。
- 图标采用同一套 `16–18px` 线性 SVG，不使用 emoji、外链图标字体或字符伪装的图标。
- 播放头使用白色竖线，所有可选时间线实体统一使用白色外框；两者含义由形态区分。当前词使用 Speech family 实心填充加白字。family 色只表示“它是什么”，品牌色只留在应用外壳。

## 成熟 NLE 调研结论

剪映参考图仍是唯一像素级复现基线。以下产品只用来验证专业 NLE 的共识，不把它们的品牌色和功能杂糅拼在一起。

- **剪映 / CapCut Desktop**：三列上区 + 通栏时间线；深灰面板之间用暗沟分隔；外壳强调色只指示当前工具和开关，时间线播放头与选中框用白色形态表达；时间线工具栏密而安静。
- **Adobe Premiere Pro**：Workspace 是可重组面板集合，而不是永久固定的功能页；同一面板标题层级和边界必须统一；时间线的工具、轨道头、标尺和内容各自职责清晰。
- **Adobe After Effects**：层和属性只在用户展开时呈现；关键帧、子属性与持续时间使用不同的层次，不在默认状态铺满整个时间线。这支持附属 facet 按需展开，而不是永久占用主时间线。
- **DaVinci Resolve Edit**：左上 Media Pool、中上 Viewer、右上 Inspector、下方 Timeline 是稳定结构；Inspector 与选中直接对应；视频缩略图和音频波形是 Clip 的主要信息；轨道头只放真正的轨道控制。
- **Final Cut Pro**：磁性时间线虽与 Hypit 不同，但它证明素材缩略带、波形、节制的彩色顶条已足以传达时间线信息，无需大量 badge 和叠层边框。
- **Palmier**：即使为 AI agent 设计，主界面仍是 Media / Viewer / Inspector / Timeline；AI 能力不该改变基础 NLE 的信息层级。其时间线用蓝色视频、绿色音频、紫色文字的小范围 family 色，其余保持中性。
- **ChatCut / OpenChatCut**：Agent 与时间线共存有产品价值，但左侧聊天和工具日志如果始终占据高权重区域，会严重干扰剪辑主任务。Hypit 第一版不把 agent 状态塞入主界面，也不学习其过多的 Clip 标签与高饱和色。

最终共识：**专业感来自稳定几何、一致密度、真实信息和克制反馈，不来自装饰。**

调研来源：

- CapCut Desktop 官网：<https://www.capcut.com/tools/desktop-video-editor>
- Adobe Premiere 工作区：<https://helpx.adobe.com/premiere/desktop/get-started/tour-the-workspace/what-are-workspaces.html>
- Adobe After Effects 面板与视图：<https://helpx.adobe.com/after-effects/using/workspaces-panels-viewers.html>
- DaVinci Resolve Edit：<https://www.blackmagicdesign.com/products/davinciresolve/edit>
- Final Cut Pro 界面：<https://support.apple.com/guide/final-cut-pro/intro-to-the-final-cut-pro-interface-ver92bd10f1/mac>
- Palmier：<https://www.palmier.io/>
- ChatCut：<https://chatcut.io/>
- OpenChatCut：<https://github.com/0xsline/OpenChatCut>

## 四区布局

### 左上：Workspace

- 它是一个可切换视图的工作区，不再是专用“代码面板”。
- 第一版只要完整支持 `SVML`；标签结构要为未来的“文件 / 任务 / 产物”留出位置，但不能用假按钮占位。
- SVML 必须有真实源码、行号、语法高亮、独立滚动与正确文本光标；禁止全局进入文本选中光标。

### 中上：Player

- 画布始终按实际比例居中 fit，允许放大超过 `100%`。
- 播放器标题、预览、运输控件、时码、适配比例的几何与参考图对齐。
- 无“LIVE”绿点、无“semantic + time basis”、无任何向用户解释我们技术多厉害的冗余口号。

### 右上：Inspector

- 只显示当前选中实体的参数。
- 第一版全部只读，但外观必须是真实属性面板，而不是调试 JSON 或说明文集合。
- 无选中时保持安静空白；禁止大段教程式空状态。

### 下方：Timeline

- 通栏铺满宽度，与参考图一样成为主操作面。
- 只展示有真实 Studio 实体的 Track，不为数据不存在的功能创造占位行。
- 第一版禁止 move、trim、canvas transform 等回写操作；不显示假把手，不使用 `cursor: grabbing`。
- 选中、定位、播放头、缩放、滚动、可见信息密度必须做到可以长时间使用的程度。

## 第一版的五类 Track

只优先打磨：

1. Speech Track
2. Media Track
3. Audio Track
4. Text Track
5. Caption Track

其他 Track 可使用安静的通用只读样式，但不得破坏五类基础 Track 的布局和滚动。

## Track adapter 与 Studio 中心层的边界

Track adapter 只注册领域差异，不能携带任意 CSS：

- 如何识别输出、继续反追溯哪些领域值，以及一个时间线实体代表什么。
- `family`、图标和内容形态，例如缩略图、波形、文本块、Cue、Semantic word。
- lane 是平铺还是嵌套、同源 facet 是否绑定，并从 Studio 的统一高度规格中注册 `min / preferred / max`。当前取 preferred；未来纵向调整只能在此范围内发生。
- 可声明一个附属 slot、附属于哪个 slot 及顺序；Studio 据此把 Picture / Voice 等 facet 紧邻根轨展开，不按 family 名字猜，也不把它们统一堆到末尾。
- Inspector 展示哪些领域属性、哪些值来自作者源码或 Candidate。
- 能否选择、移动、裁边、画布变换，以及每种操作是否具备确定的源码回写。

Studio 中心层统一负责所有 NLE 交互和视觉语法：

- Clip 的圆角、上下 2px lane 内边距、字号、默认箭头光标、hover 规则和白色选中框。
- 所有 item 使用同一种两行语法：固定 17px Header 加自适应 Content。adapter 只能选择 Content shape，不能重写 Header 或 item 外框。
- 选中框统一画在 Clip 外部：上下约 1px 白色细线、左右约 3px 圆角端帽；adapter 只能声明 trim 能力，不能自行画把手。
- 点击、双击、scrub、吸附、缩放、播放头、键盘和越界反馈。
- family 到统一色板的映射；adapter 声明语义 family，不直接提供任意颜色。
- 未适配 shape 的通用只读降级，保证第三方 Track 可见但不伪造编辑能力。

判别原则：删掉某个 Track 后仍必须保持完全一致的东西属于中心层；只有理解该 Track 的领域值才能决定的东西才属于 adapter。

### 统一 Item 语法

- lane adapter 注册高度范围；Studio 当前使用 preferred 高度。Speech Picture 与普通 Media 使用同一个 Picture 高度规格，Speech Voice 与普通 Audio 使用同一个 Audio 高度规格，不存在附属“小号版”。
- item 高度始终是 lane 高度减去上下各 2px，所有 Track 拥有一致且更高的行内占比。
- Header 固定 17px，承载名称和足够宽时的时长；任何 Track 不得自行改变 Header 高度。
- Content 始终有 family 色派生的背景框。Media 的素材帧填满 Content；Audio 在 Content 中显示波形；Text / Caption 在 Content 中显示真实正文。
- `group/window` 与 Semantic word 属于“子盒集合”Content。小盒使用与 Header 相同的 17px 高度并在 Content 内垂直居中，不随 lane 高度无限膨胀。
- family 只提供 `fill / rail` 两个 token。Studio 统一派生 Header、Content、Cell 三层表面；adapter 不得提供第三套局部配色。
- `shape` 是开放的内容协议。Studio 认识 `picture / waveform / text / group / window`；未知 shape 降级为安静的只读 Content，不靠 adapter 名称或包名猜 CSS。

### 色彩职责

色彩也属于 Studio 中心层。Track 只提供可读的 `family`，不提供颜色值；这样第三方 Track 不会把自己的颜色规则带进整个 NLE。

品牌 ramp 单独定义为 `brand-200/400/500/600`，所有交互只消费 `interaction-accent` 等语义 token。以后若浅粉不适合产品的科技感，只替换这一组 ramp，不改 family 色、组件 CSS 或交互逻辑。

Family 色轮如下：

| family | fill | rail | 用途 |
| --- | --- | --- | --- |
| speech | `#008882` | `#00d5cd` | 语义时基与口播 |
| media | `#007bb2` | `#38c5ff` | B-roll 与画面 |
| audio | `#38853e` | `#75d079` | 音频 |
| text | `#5c69bc` | `#9caeff` | 普通文字 |
| caption | `#8e57a5` | `#db98f9` | 字幕 |
| component | `#ae5528` | `#ff9661` | 组件和特效 |

Family fill 保持相近视觉明度，最小色相距离约 40°，同时主动避开品牌粉色。品牌、family、位置状态三层互不借色。

### Speech Track

- Speech 是正常高度的一条 Track，不是巨型黄色“伟大轨道”。
- 每个 Segment 是一个紧凑的两行容器：上行是段名和足够宽时的帧长，下行是按词窗比例排列的实心词块；词块之间的 1px 黑缝就是空隙和 anchor，不再画 L 形边框。
- 词盒使用统一紧凑 Cell 高度，在第二行垂直居中；缩小时隐藏整行细节，空间足够时逐步显示词文本。
- 播放头所在词用 Speech 实心填充加白字；空隙保持 lane 背景，不能把整段误画成连续色墙。
- Segment 未选中时没有白框；选中后复用所有 Clip 的同一套 `clip-selection` 外框与端帽，不单独发明 Speech 描边。
- Speech 的 semantic / visual / audio facet 保持同源绑定。Picture 使用普通 Media family 外观，Voice 使用普通 Audio family 外观；二者通过 adapter 声明为附属轨，展开后直接位于 Speech 下方。
- 左侧 Track Header 是统一的中性单行控制区：图标、名称与 disclosure 使用灰阶，不重复 family 色，不显示 item 数量，也不画文件树式横竖连接线。
- 附属关系只用相邻位置、轻量缩进与根轨 disclosure 表达；family 色只留给时间线 item。

### Media Track

- Header 展示名称与足够宽时的时长，Content 展示可识别的缩略图带。
- 静态图直接按素材格铺入 Content；定时视频从 Run 已选中的真实 Artifact 抽取等距帧组成缩略带。两者复用同一个 `picture` shape，不由 adapter 发明第二套 DOM。
- 视频 Artifact 第一次进入 Studio 时由 Studio 服务端生成一次不可变 filmstrip 图集，并按 Artifact digest 缓存；图集帧保持源视频宽高比和时间顺序。浏览器缩放和平移只按时间坐标选择图集中的格子，不再 seek 或重新解码视频，不重复、不轮播，也不拉伸同一帧。已解析图集在重建 lane 时同步挂载，缩放中不得闪空。音频波形由真实 WAV 峰值生成 SVG，按窗口宽度缩放仍保持矢量清晰。
- 选中使用 1px 白色外轮廓和两侧细圆角端帽，不覆盖原始素材颜色；播放头仍保持白色竖线。

### Audio Track

- Header 展示名称和时长，Content 从 Run 已选中的真实音频 Artifact 解码峰值并绘制波形；没有音频 Artifact 就保持普通背景，不制造规则条纹或随机振幅。
- 与视频同源的音频通过 attachment / group 关系表示绑定，物件外观仍与普通 Audio 完全一致。

### Text Track

- Header 显示作者 item id，Content 直接显示实际文字；背景框始终存在，因此短文字也仍是可选择的时间物件。
- 不把字体、坐标、帧窗口全部挤在 Clip 上；其他参数进 Inspector。

### Caption Track

- Caption cue 按真实 cue 窗口排列；Header 是 cue 身份，Content 是实际字幕文本，宽度不足时自然裁切。
- Caption 与 Speech 使用不同的实体外观，但词边界必须与同一时基对齐。

## Moment、Selection 与投影呈现（待重新设计）

- Moment 和 Selection **不作为独立的时间线 UI 元素显示**。两者都没有 badge、菱形、括号、黄底、单独行或悬浮标签。
- 两者仍然是组件时间投影的作者来源，lineage 数据继续保留在 Snapshot 与 Inspector 中。
- 当前版本不在时间线上绘制任何投影虚线、端点或越界标记；这套呈现需要重新讨论后再恢复，不能用不成熟的线条静默解释作者关系。
- 虚线默认隐藏，选中时出现，失去选中后消失。它必须跨 lane 正确对齐，且不能被 sticky header、滚动容器或 Clip 背景错误裁切。
- 当组件有总窗口与子窗口时，未来呈现必须由组件 adapter 明确声明实体与窗口关系，不允许 Studio 猜测。

## 必须铲平的显示 Bug

- 纵向滚动时 sticky 行、标尺与 Clip 不得穿模。
- 水平滚动和缩放后，标尺、播放头、Clip 与词刻度仍使用同一坐标。
- 面板分割线只出现一次，不因 sticky、border 与 box-shadow 叠加成双线。
- 时间线缩放不得改变 Track Header 宽度或造成内容跳动。
- 标尺步长按当前可见帧数选择；缩放到足够近时，必须显示逐帧刻度和帧号，不得永远停留在整秒刻度。
- 标尺是一套连续帧格而非“秒模式 / 帧模式”开关：整秒只是其中优先级最高的一类帧格，当前视窗起点的 `MM:SS` 始终保留。刻线和刻字分别按最小屏幕间距从同一组帧率约数取步长；放大时帧字按 `15 → 10 → 6 → 5 → 3 → 2 → 1` 帧级别逐渐变密，最大倍率可见奇数帧。秒是上位时间语义，帧字只能填入整秒之间，不能替换或吞掉它。
- 选中 Clip 不得让预览消失、触发整个 DOM 重建或不必要的 HyperFrames 重算。
- 安静状态下不运行持续动画、轮询布局或逐帧重绘整条时间线。

## AI slop 禁令

下列任何一项出现都视为未完成：

- “semantic + time basis”、“live”绿点、“measured”、“ready”等无操作价值状态文案。
- 向用户解释当前面板存在意义的大段文字。
- 黄色半透明底 + 蓝色选中、彩色渐变、发光、毛玻璃、大圆角卡片滥用。
- 为了填空白而添加的 badge、提示、指标、装饰线或假功能。
- 把技术内部名称当作用户界面标题。

## 验收

1. 以 2048×1174 视口打开真实 `studio.svrun`，布局分区、面板比例、时间线占比、工具栏密度与参考图一致。
2. 五类基础 Track 均可正确选中、定位、读取名称和时间；全部只读，无假操作。
3. Speech 为正常行高，词窗与真实空隙清晰分开，缩放时信息逐级展开；Moment / Selection 无独立显示。
4. 当前版本不绘制投影虚线；选择关系仍可在 Inspector 中读取，之后按独立规格恢复。
5. 反复执行纵向滚动、水平滚动、最小/最大缩放、选中不同 Track，无穿模、双线、跳动、预览消失或卡死。
6. 界面上不存在本文“AI slop 禁令”中的任何内容。
7. TypeScript 检查通过，真实 Studio Run 可打开，实际截图经与参考图并排检查后达到可交付水平。

## 本轮验收记录

- Hero Meme：1080×1920、30fps、18.10s，已移除 Ranking 与 Comment 组件，只保留 Text、B-roll Media、Caption 三类内容 Track；Speech 可展开紧邻的 Picture / Voice facet，时间线不绘制投影虚线。
- Speech 的三段 Picture 已从各自归一化 MP4 抽取真实缩略帧，三段 Voice 已从各自 48 kHz WAV 计算真实波形；Studio 播放时由 AudioTrack 的 WAV 跟随同一帧时钟发声，归一化后的静音 MP4 始终只负责画面。
- 全组件样例：Text 显示真实正文，Caption 显示真实 cue 文本，Media 使用 Run 中实际静态素材绘制缩略图带。
- 2048×1174 视口：左 / 中 / 右上区实测约 34% / 43% / 22%，时间线约占 45%；各行由 adapter 注册高度范围，当前 preferred 为 Semantic 56px、Picture 62px、Audio/Text/Caption 48px、Component 52px。
- 普通 Track 与 Semantic Track 均使用固定 17px Header + Content；所有 item 上下只留 2px，附属 Picture / Voice 与普通 Media / Audio 使用完全相同的尺寸和 shape renderer。
- Family fill 与品牌交互色彻底分层：Speech `#008882`、Media `#007bb2`、Caption `#8e57a5`、Text `#5c69bc`、Component `#ae5528`、Audio `#38853e`；品牌交互色为可替换的 `#e573a3`，播放头与选中框为白色，当前词为 Speech 色填充加白字。
- 连续缩放、选中与 facet 展开后，无 `NaN`、无页面横向溢出、无浏览器异常；标尺与 Track Header 保持对齐。
