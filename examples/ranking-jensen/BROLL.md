# Jensen Ranking B-roll 设计记录

## 目标

B-roll 不是对口播逐字配图，而是把每个关键包袱压缩成一眼能读懂的 meme。标题、Caption、ranking 榜单和五个累计头像仍是画面骨架；B-roll 只在包袱需要第二层视觉答案时出现。

外部创意稿把现实人物与事件写成夸张的地狱笑话。项目把这些内容视为本片的讽刺设定，不把未经核实的私人关系、间谍或职务变动描述成素材事实。真实照片只用于可核实的公开场景或人物识别；涉及具体指控的画面优先使用明显虚构、重绘或界面恶搞的表达。

## 三种素材路线

### 直接使用梗图

适用于 Anthony Adams 搓手、Math Lady、Spider-Man 指人、Confused Nick Young、Drake、GTA WASTED 和 Galaxy Brain 等识别度依赖原模板的画面。使用前记录来源页、可下载入口、分辨率、水印和使用风险；文字与 NVIDIA 绿色视觉在项目内重新排版。

### 基于梗图重绘

适用于 Rose 的 84 years、Huell 钱堆、影视人物和画质过低的模板。保留人物关系、姿态和笑点结构，但不追求逐像素复制；统一成适合 9:16 视频、能叠在 A-roll 上的高对比贴纸或插画。

### 为本片新画

适用于 `Wife_v1.0.exe`、H100 Honeytrap 档案、CUDA 心电图、婚姻 404、USB 抽取源码、DeepSeek 文件传输、RTX 皮衣 X 光、GPU 烛光晚餐和 JacketGPT 董事会。这些画面没有必要伪装成真实截图，应直接把笑点、文字和构图设计完整。

## 画面规则

- B-roll 绑定 Script Cue 或 Selection，不用手写孤立秒数。
- 同一数字是一组持续画面，不是一批同时入场的图片。组内第一张跟随最早的台词出现并保留，后续图片在各自台词处加入；组末统一退出。这个关系沿用旧 ranking 源码中外层 Selection 包住后续内层 Selection 的做法。
- `broll.sequence.json` 记录每组采用的 Media Asset、组内顺序、替换例外和可手调布局；`documents/jensen.script` 只记录这些图片跟随的语义边界。`scripts/compose.ts` 把 Selection 投影到已对齐 A-roll 的准确时间，再写入 NLE。
- 常规绘制顺序为 A-roll、ranking、B-roll、Caption、顶层 reveal flash；标题保持可读。
- 图片的阴影、裁切、边框和内边距属于 occurrence 的呈现，不属于 Media Asset。当前每个 B-roll Item 使用 `@hypit/picture-frame`，复用旧 ranking 的 `0 18 34 -8 #000000D9` 阴影；NLE 因而可以独立检查或修改这层 treatment。
- 贴纸和卡片优先落在画面上半部到榜单上沿之间，避开人脸和 Caption。
- 每个笑点通常保留 1.0 至 2.4 秒；信息密集的招聘卡或聊天截图可以更长。
- 入场以 6 帧缩放淡入或 7 帧上浮为主，退出使用 4 帧淡出或轻缩；同一段内不混用过多运动语言。
- 原梗图的文字只保留笑点必需部分；复杂信息由新画界面承担，不在小图上堆字。
- 搜索结果只是候选来源，不自动获得使用许可。最终采用直接使用、重绘还是新画，以素材清晰度、来源和成片效果共同决定。

## 当前取舍

老婆段适合从经典梗图快速建立节奏；Trump 段用熟悉模板强化连续反问；Kimberly 段以原创 UI 和医疗图形为主；Alice 段把奢侈品对比与数据窃取画面连成一个升级笑点；皮衣段逐步从硬件扫描升级到完整的 JacketGPT 世界观。

## 第一轮素材检索

已经找到可直接进入内部预览的 Anthony Adams、Math Lady 和 Confused Nick Young 清晰模板；它们没有文字或站点水印，但仍包含摄影、节目或演员肖像，公开发布前需决定继续直用还是重绘。Spider-Man、Huell、Rose、Drake、Galaxy Brain 和 GigaChad 的来源已经明确，更适合作为重绘语法而不是最终素材。

可以直接作为画面底材的来源包括公共领域的 Trump 竖拇指照片、Pexels 竖版心电监护视频与会议室、CC0 单眼机器人，以及按单张许可筛选的 Wikimedia NVIDIA 办公楼图片。NVIDIA 官方 H100、RTX 5090、B200 和黑皮衣图片主要作为产品与造型参考，不默认具有公开改编许可。

Kimberly Powell 的 GTC 2025 Healthcare VP 公开演讲和 1680x1261 舞台照片已经找到；它只证明公开职务与活动场景。创意稿提到的背景 Q 版黄仁勋细节尚未确认，不能写成已验证事实。

首批最适合落地的是：老婆段的 Anthony Adams、Trump 段的公共领域竖拇指与 Nick Young、Kimberly 段的心电监护画面、皮衣段的 JacketGPT 会议室。它们分别覆盖直接梗图、真实公共素材、可编程图形和原创合成四种制作路径，足以先验证 B-roll 在当前画面骨架中的尺寸、层级与节奏。

具体候选、获取方式和状态维护在 `broll.assets.json`。素材进入项目后放入各自的 `media/<asset-id>/`，由 NLE Item 显式引用，不在组件内部藏图片。

## 当前协作状态

飞书 meme 表负责让人快速把候选图放到对应段落；项目内的 `broll.assets.json` 与 `media/` 才是制作记录。2026-11-14 已接收用户给出的 LinkedIn、人物恶搞、医疗和皮衣段成图，并按备注完成 11 张确定性派生图：经典 meme 字幕、Spider-Man 标名、三任妻子奖牌、Nick Young 头像板、双按钮文案、Drake 的 Birkin/H100 两阶段、Alice 方形头像和 Galaxy Brain 文案。原图全部保留，派生图使用 `final-*.png` 命名；复现脚本为 `scripts/render_meme_variants.py`。

同日第二轮按飞书备注完成 `v2`：老婆段改为底部双行大字；Spider-Man 名字移到腿部；三任妻子改为底部金银铜纯文字；Nick Young 改用新 Alice 头像、单层白色圆框和无底框 Impact 名字；按钮文字上移；Galaxy Brain 统一在 `DATING` 后换行。`media/icon-alice/icon-alice.png` 已替换为新方形头像，上一版保存在 `icon-alice-v1.png`，ranking board 继续通过同一 Media Asset 引用新图。

最终 `v3` 由用户在 `tools/meme-layout-editor/` 中直接拖动并保存：`LORI'S LAWYER`、`LORI AFTER DIVORCE` 保持单行；Spider-Man 两个名字独立定位；按钮文案保持摆正的双行，并让未按下、同时按下两张图共享同一组坐标和字号。权威坐标保存在 `scripts/meme-layouts.json`，派生图继续由 `scripts/render_meme_variants.py` 输出。

`Highest-paid job in history.` 使用用户提供的 LinkedIn 招聘职位成图，作为普通图片素材保存在 `media/broll-wife-linkedin-job/source-user.png`。界面内容已经定稿，不再建立项目组件或 Inspector 参数；进入 NLE 时只需把这张图片作为媒体放到对应时间窗。

2026-11-14 已按飞书数字完成 1–15 组时序。第 3 组的 Math Lady 在 `That's` 开始，小李子撒钱图在 `five million` 开始；第 9 组在 `losing my wife` 处从未按下按钮图交叉替换为同时按下图，并持续到 `and my job` 结束；第 11 组在 `She wanted H100s` 处从 Hermes 交叉替换为 H100。其余多图组采用逐句累积。旧 ranking 的源码关系位于 `examples/ranking-football/reference.svml`，本项目不复制它的秒数，只复用嵌套 Selection 的编排原理。

当前 `film.nle.json` 已包含独立的 `broll` 轨道，共 29 个图片 occurrence 和两处 5 帧 Cross Dissolve。几张缺少可靠色彩标记的 JPEG/WebP 原图仍然保留，NLE 使用同目录 PNG 派生图；`84 years` GIF 则转换为可循环的 MP4 派生媒体，避免把动画错误冻结成静帧。制作期间的诊断抽帧已经完成职责，不作为项目源文件长期保留。

每张 B-roll 的 occurrence frame 与媒体真实宽高比一致，等价于旧 Ranking Source 的 `AspectFrame`：`contain` 只负责把像素放进同宽高比的局部空间，不再留下大于图片的透明占位壳。阴影属于 occurrence 的 frame treatment，使用旧配方 `0 18 34 -8 #000000D9`；它不写回 Media Asset，也不藏进图片或 Ranking 组件。布局编辑器只等比改变 frame 大小，并以千分之一像素精度保存，避免反复编辑后重新产生空壳。

B-roll 动画继续采用旧 Ranking Source 的三种 occurrence motion。`pop` 在 6 帧内从 0.7 倍淡入弹到原尺寸，结束前 4 帧淡出；`rise` 在 7 帧内从下方 80px、0.92 倍淡入，结束前 4 帧缩到 0.94 倍；`wide` 在 6 帧内从 0.9 倍轻推到原尺寸，结束前 4 帧淡出。项目在 `broll.sequence.json` 的 `behavior.motion` 声明交替规则和宽图阈值，单个 Item 仍可用 `motion` 覆盖。Compose 将它们下落为 occurrence 自己的 `@hypit/picture-transform` 与 `@hypit/picture-filter` operators；Media Asset、Ranking 组件和 NLE Core 都不认识这些作品特定的动作选择。

Selection 只声明每张图由哪句语义触发，不承担组间留屏。`broll.sequence.json` 的组顺序负责 occurrence 生命周期：同一 tier 内，累积组的所有已出现图片保持到下一组第一张的开始事件；替换组的第一张在第二张开始时以 5 帧 Cross Dissolve 交接，第二张保持到下一组。跨 tier 时，上一人物的最后一组在下一段 A-roll 的第一个词开始时结束，例如妻子段在 `Trump is B tier` 的 `Trump` 开头清场，而不是继续保持到 Trump 段第一张 B-roll 出现。最后一组保持到作品结束。
