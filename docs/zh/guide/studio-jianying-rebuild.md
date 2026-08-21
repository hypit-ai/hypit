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
- 左侧 Track Header 为固定宽度，右侧内容水平滚动；两者纵向只有一个滚动真相。

## 配色与排版纪律

- 使用剪映的中性灰层级：应用背景、面板背景、悬浮/选中背景。不使用大面积渐变、玻璃拟态或带色半透明底。
- 青色是唯一全局强调色，只用于当前工具、播放时间、焦点和选中边缘。
- Track family 颜色用于 Clip 实体填充和 Track 图标 rail；lane、面板、标尺与空白区域保持近黑中性。Clip 必须作为明显高于 lane 的物体出现，不能把低饱和 token 再兑入近黑导致所有 family 落进同一条泥色明度带。
- 正文与数字使用系统 UI 字体；源码使用等宽字体。时码必须使用 tabular numerals。
- 不得出现低于 `11px` 的信息文字；不使用奇怪的半档字号和任意字重。
- 图标采用同一套 `16–18px` 线性 SVG，不使用 emoji、外链图标字体或字符伪装的图标。
- 播放头使用白色，选中与时间投影使用青色；不能让一个强调色同时承担播放位置与选择状态。

## 成熟 NLE 调研结论

剪映参考图仍是唯一像素级复现基线。以下产品只用来验证专业 NLE 的共识，不把它们的品牌色和功能杂糅拼在一起。

- **剪映 / CapCut Desktop**：三列上区 + 通栏时间线；深灰面板之间用暗沟分隔；青色只指示当前工具、时码、开关和选中边缘；时间线工具栏密而安静。
- **Adobe Premiere Pro**：Workspace 是可重组面板集合，而不是永久固定的功能页；同一面板标题层级和边界必须统一；时间线的工具、轨道头、标尺和内容各自职责清晰。
- **Adobe After Effects**：层和属性只在用户展开时呈现；关键帧、子属性与持续时间使用不同的层次，不在默认状态铺满整个时间线。这支持“投影线仅在选中时显示”。
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

### Speech Track

- Speech 是正常高度的一条 Track，不是巨型黄色“伟大轨道”。
- Segment 作为紧凑的容器，词边界作为内部刻度线；只有宽度足够时才显示词文本。
- 缩小时合并细节，放大时逐步显示词，与剪映缩放素材缩略信息的方式一致。
- Speech 的 semantic / visual / audio facet 保持同源绑定，但不得重复画三份冗余信息。是否分行由当前实体表示决定，时间和选中必须同步。

### Media Track

- Clip 展示可识别的缩略图带、名称与足够宽时的时长。
- 只有一个真实 poster 时，在 Clip 头部显示一张裁切后的 poster chip，并向 family fill 淡出；不平铺一帧伪装成胶片带。
- 选中使用细青色轮廓，不覆盖原始素材颜色。

### Audio Track

- 使用紧凑波形视觉；没有波形数据时使用安静的基线，不伪造随机波形。
- 与视频同源的音频可表示绑定关系，但不使用大面积颜色填充。

### Text Track

- Text item 是干净的单色 Clip，标题就是实际文本或可识别名称。
- 不把字体、坐标、帧窗口全部挤在 Clip 上；其他参数进 Inspector。

### Caption Track

- Caption cue 按真实 cue 窗口排列，可读的词只在宽度足够时出现。
- Caption 与 Speech 使用不同的实体外观，但词边界必须与同一时基对齐。

## Moment、Selection 与投影线

- Moment 和 Selection **不作为独立的时间线 UI 元素显示**。两者都没有 badge、菱形、括号、黄底、单独行或悬浮标签。
- 两者只是组件时间投影的作者来源。用户选中某个消费实体时，Studio 才显示克制的投影虚线。
- 投影虚线将 Speech 内部的语义坐标连到被选中实体的实际消费边界：Moment 产生一个源点，Selection 产生两个端点；两者使用同一视觉语法，不使用颜色或形状分类。
- 虚线默认隐藏，选中时出现，失去选中后消失。它必须跨 lane 正确对齐，且不能被 sticky header、滚动容器或 Clip 背景错误裁切。
- 当组件有总窗口与子窗口时，选中哪个实体就只画它的投影。不同时把所有投影线铺满时间线。

## 必须铲平的显示 Bug

- 纵向滚动时 sticky 行、标尺、投影线与 Clip 不得穿模。
- 水平滚动和缩放后，标尺、播放头、Clip、词刻度和投影线仍使用同一坐标。
- 面板分割线只出现一次，不因 sticky、border 与 box-shadow 叠加成双线。
- 时间线缩放不得改变 Track Header 宽度或造成内容跳动。
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
3. Speech 为正常行高，缩放时信息逐级展开；Moment / Selection 无独立显示。
4. 选中有时间来源的消费实体时，投影虚线正确出现；取消选中后消失。
5. 反复执行纵向滚动、水平滚动、最小/最大缩放、选中不同 Track，无穿模、双线、跳动、预览消失或卡死。
6. 界面上不存在本文“AI slop 禁令”中的任何内容。
7. TypeScript 检查通过，真实 Studio Run 可打开，实际截图经与参考图并排检查后达到可交付水平。

## 本轮验收记录

- Hero Meme：1080×1920、30fps、18.10s，真实预览可播放；Ranking Selection 选中后显示 2 条投影线，Speech 可展开绑定的 Picture / Voice facet。
- 全组件样例：Text 显示真实正文，Caption 显示真实 cue 文本，Media 使用 Run 中实际静态素材绘制缩略图带。
- 2048×1174 视口：左 / 中 / 右上区实测约 34% / 43% / 22%，时间线约占 45%；Speech lane 固定 52px。
- Family fill 使用等感知明度/色度生成的实色：Speech `#008768`、Media `#3672b7`、Caption `#805bab`、Text `#5a68b8`、Component `#a55a0f`、Audio `#328344`；lane 为 `#0c0d10`。相邻 Clip 通过 2px 黑缝分离，不使用泥色描边。
- 连续缩放、选中与 facet 展开后，无 `NaN`、无页面横向溢出、无浏览器异常；标尺与 Track Header 保持对齐。
