# SVML 开源准备：结论 + 问题清单

## 基本信息

- **仓库名：** svml
- **一句话：** Address with words, not timecodes.
- **Tagline（英文）：** SVML — a markup language for talk video.

---

## 我们做了什么

一门标记语言，把口播脚本编译成成品视频。

传统视频编辑的原子操作是时间码（`at: 01:02:03:15`）。SVML 的原子操作是语义地址（`during={script.selection.photoshop}`）。你在脚本里标注"说到这个词的时候显示这个图标"，编译器拿到语音时间证据后，一次性把所有视觉元素钉死在时间线上，输出成品视频。

脚本就是程序，语音就是时钟。源码里没有任何时间码。

技术栈：TypeScript + Node.js 单依赖编译器。`.svml` 源码编译到 HyperFrames HTML，再录制为 MP4。

---

## 目标用户是谁

三句话，三个客户群，同一个产品：

- **A high-level video language for developers.**
- **An editing-free production system for creative teams.**
- **A scalable marketing video engine for brands.**

这不是三个产品。就像 iPhone 同时是 iPod、手机和互联网通讯器。同一门语言，三个价值面。

---

## 我们能做什么类型的视频

**Talk video（说片）** — 口播、街头采访、播客、产品测评、YouTube essay。

共同特征：有人在说话，说话驱动一切。说到哪个词，画面就跟到哪里。

| 类型 | 有东西要定位 | 有定位锚点（speech） | SVML 的价值 |
|---|---|---|---|
| 口播/街采/播客 | 有（图标、broll、排行榜、分屏） | 有（speech semantic address） | **满配** |
| 纯 AI 视频（短剧等） | 有（但只是顺序拼接） | 没有（prompt → clip，没有内部结构） | 杀鸡牛刀 |
| 纯代码视频（motion graphics） | 没有（全是绝对时间编排） | 没有（不需要 late binding） | 多此一举 |

我们不做的：纯 AI 短剧（没有内部结构需要定位），纯 motion graphics / launch video（没有不确定的时间需要 late bind）。当然严格来说都能做，但失去了意义。

---

## 核心机制：time-responsive video

类比 responsive web design：

- 响应式网页：布局相对于语义结构书写 → 浏览器根据 viewport 解算成像素。你不写 `left: 347px`，你写 `margin: auto`。
- **响应式视频：** 视觉元素相对于语义脚本书写 → 编译器根据语音证据解算成帧。你不写 `at: 3.5s`，你写 `during={script.selection.photoshop}`。

同一份 `.svml`，换一个语速更快的人录，所有视觉元素自动重排——就像同一份 CSS 在手机和桌面上自动重排。这就是 time-responsive。

**Semantic addressing vs timecode addressing** — 这是范式区别，不是功能区别。传统剪辑用 timecode addressing（`01:02:03:15`），SVML 用 semantic addressing（`script.selection.photoshop`）。

---

## SVML 不是什么

- **不是 "source code for videos"** — HyperFrames 已经占了这个位。SVML 编译到 HyperFrames，就像 C 编译到汇编。
- **不是 Twinit 节点图的文本序列化** — 虽然 Twinit 是第一个商业用户，但 SVML 是独立的语言。
- **不是 AI 视频生成器** — 编译器是纯确定性的，不调用任何 AI provider。AI 生成是 Runtime Host 的事，不是语言的事。
- **不是剪辑器** — 没有时间轴。时间轴是编译器算出来的，不是人拖出来的。
- **不是模板系统** — `.svml` 文件是完整的程序，不是填空题。但可以被模板系统用作底层。

---

## 竞品坐标系

| 产品 | 本质 | 和 SVML 的关系 |
|---|---|---|
| CapCut / Premiere / DaVinci | 时间轴编辑器 | SVML 取消了时间轴。不竞争，不同范式 |
| Palmier / ChatCut | AI 辅助剪辑器 | 可能加 WhisperX 做辅助定位，但还是剪辑器。SVML 是编译器 |
| Flova / Higgsfield / LibTV | 模板生成器 | SVML 可以是它们的底层编译目标，不是竞争对手 |
| HyperFrames | 视频的 HTML | SVML 的编译目标，不是同层 |
| Remotion | 代码驱动视频（React） | 绝对时间编排，不做 speech-located。互补 |
| After Effects / Motion | 动效工具 | 纯代码视频领域，不需要 late binding |

SVML 没有直接竞品。最接近的描述是：视频领域的 LaTeX / CSS / Markdown——一门让非像素、非时间码的抽象方式成为可能的语言。

---

## 和 Twinit 的关系

Twinit 是用 SVML 作为底层的商业视频工厂（canvas + AI provider + 渲染集群 + 操作员工作台），已有 B2B 客户（Cluely、Starot、Lessie AI、Megneta、MeetWhale 等）。

可能的关系模型：
- **类比 1：** Terraform HCL（开源语言）+ HashiCorp Cloud（商业平台）
- **类比 2：** Kubernetes（开源引擎）+ GKE/EKS（商业托管）
- **类比 3：** React（开源框架）+ Vercel（商业部署）

SVML 开源获取开发者社区和技术信任，Twinit 作为 "SVML 的最佳商业实现" 做 B2B 营收。

---

## 开源目标

1. 开发者社区验证——证明 semantic addressing 这个范式有人认可
2. Star 和技术影响力——为融资和品牌背书
3. 生态贡献——第三方可以写 Component（stdlib 的 `.svk`）、Frontend、Provider adapter
4. Twinit 的技术护城河公开化——开源让客户信任底层不是黑盒

---

## "说片"品类定义（中文场域）

说书 = 用嘴讲的书。说唱 = 用嘴讲的歌。**说片 = 用嘴讲的片子。**

口播、街采、播客、解说——抖音叫口播，B站叫解说，YouTube 叫 essay video。结构上它们是同一个东西：一个人在说话，画面跟着走。我们把它统一命名为"说片"。

---

## Demo 素材

- `regen-ranking.svml`：170 行源码，编译出 36 秒成品视频。源码读起来像剧本，里面没有任何时间码。
- 已有编译产物视频（Downloads 里有 MP4）

---

## 为什么天才创作者现在不想用

诚实的自我诊断：

1. **要手写 XML-like 标记语言** — 创作者的工具应该是低门槛的
2. **所有素材必须预先存在** — 没有 AI provider integration，不能写 intent 让 AI 生成
3. **没有即时反馈** — 写代码 → 编译 → 等结果，不是所见即所得
4. **stdlib 太窄** — 目前只能做排行榜口播视频这一种
5. **没有 GUI** — 纯 CLI，没有可视化编辑器

这些是产品层面的缺失，不是语言层面的问题。语言设计（Script Surface、semantic addressing、deterministic compilation）是对的。

---

---

# 问题清单（按版块，重要→不重要）

## 一、定位与品类（最关键）

1. 我们做的品类叫 talk video / "说片"，但这个品类名现在不存在。你之前陪跑的项目里，有没有需要**先建立品类认知**再做发布的？怎么处理的？
2. AFFiNE 可以说 "Notion alternative" 建坐标系。我们说不了 "X alternative"，因为没有 X。开源项目没有竞品参照的时候怎么让人快速理解？
3. "Address with words, not timecodes" 作为 tagline，你觉得开发者第一眼看到能理解吗？需要配什么视觉才能秒懂？
4. 三句话定位（language / production system / engine）会不会让人困惑——到底是给谁用的？还是说这种多面定位反而有优势？
5. talk video 这个英文品类名足够清晰吗？开发者听到会不会以为是 video call？有没有更好的表达？
6. "说片"这个中文造词在中文开发者社区会不会太文艺、太抽象？要不要用"口播视频"这种大家已经懂的词？
7. 我们是应该把自己定位成一个"语言"还是一个"工具"？语言更长期但更难推，工具更容易理解但天花板低。你的经验是？
8. time-responsive video 这个概念有必要在 README 第一屏提吗？还是留给技术博客？

## 二、GitHub README

1. 我们开源的是一门语言和编译器，不是有 GUI 的产品。README 第一屏应该放什么？源码？编译出的视频？还是源码→视频的对比？
2. 你做过这么多万星项目，语言/编译器类项目（不是 app 类）的 README 有没有特别好的参考？
3. Demo 视频放 GitHub README 里最佳的格式是什么？GIF？内嵌视频？YouTube 链接？
4. Quick Start 部分——我们的 quick start 是 `pnpm install` 然后 `pnpm svml compile example.svml`，能在 5 分钟内跑通。但跑通之后用户只得到一个 HTML 文件，没有"哇"的时刻。怎么设计这个体验？
5. 需不需要在 README 里放竞品对比表？我们严格来说没有直接竞品。
6. README 里要不要提 Twinit？提了会不会让人觉得这只是一个公司的内部工具开源？
7. Star 请求放在哪里最有效？顶部？底部？行内？
8. 中英文 README 怎么处理？双语？分 repo？分文件？
9. Contributing guide 开源第一天就需要吗？还是等有人来了再写？
10. 需要 awesome-svml 这类生态 repo 吗？现在太早？

## 三、官网

1. 我们需要一个单独的官网吗？还是 README 就够了？
2. 如果做官网，第一版需要什么？landing page？文档站？playground？
3. 有没有低成本方案——比如直接用 GitHub Pages + 一个好的 landing page？
4. 官网需要放 pricing 吗？我们开源部分免费，Twinit 商业付费——怎么讲？
5. 官网域名建议？`svml.dev`？`svml.video`？`svml.io`？

## 四、开发者文档

1. 语言类项目的文档结构应该是什么样的？Tutorial vs Reference vs Explanation？
2. 我们有很完整的 spec 文档（script-surface-v1.md 等），但那是内部设计文档。需要重写成面向外部开发者的版本吗？
3. Interactive playground / REPL 对语言类开源项目有多重要？需要优先做吗？
4. 文档和 README 之间应该怎么分工？README 讲什么，文档讲什么？

## 五、PR 长文 / 发布文章

1. 开源发布的 PR 长文应该发在哪里？Medium？Dev.to？个人博客？公众号？
2. 长文的叙事结构应该是什么？问题→方案→demo→call to action？还是别的？
3. 需要一篇技术深度文章（讲 semantic addressing 的原理）和一篇大众文章（讲为什么剪辑器该死了）吗？还是合成一篇？
4. 中英文发布文章的发布顺序和内容差异？
5. 发布文章里该不该提 AI？"AI 时代的视频编程语言"会不会蹭热度但偏离本质？

## 六、内容素材包

1. 我们有一个天然优势：demo 就是视频。怎么最大化利用这个？
2. 需要一个 30 秒的 explainer video 吗？类似 "What is SVML?"
3. Logo 和视觉 identity 现在需要吗？开源第一天没有 logo 会不会显得不专业？
4. KOL 可以直接引用的短文案——英文和中文各需要几个版本？
5. 源码→视频的对比图/GIF 怎么做最有冲击力？

## 七、X (Twitter)

1. 发布推文的最佳格式？Thread？单条+视频？
2. 应该打哪些 tag？#opensource？#ai？#video？#devtools？
3. AI video 圈的 KOL 你有推荐吗？我们应该联系谁？
4. 发布时间——北京时间几点发对应美国开发者社区最活跃的时间？
5. 需要一个项目官方 X 账号还是用创始人个人账号？
6. 发布前需要预热吗？提前几天开始？发什么？

## 八、Reddit

1. 哪些 subreddit 适合我们？r/programming？r/opensource？r/videoediting？r/webdev？
2. Reddit self-promotion 规则现在多严格？我们需要提前联系 moderator 吗？
3. 发帖的角度——"Show HN" 式的技术展示？还是 "I built this" 式的个人故事？
4. Reddit 帖子的标题怎么写最有效？

## 九、Hacker News

1. HN 的标题风格——"Show HN: SVML – Address with words, not timecodes" 这样可以吗？
2. HN 社区对视频/创作者工具的接受度怎么样？会不会觉得太 niche？
3. 发布时间的策略——美东上午？周几最好？
4. 需要提前在 HN 上有活跃历史吗？

## 十、社区（Discord / Telegram）

1. 开源第一天就需要建 Discord 吗？还是等有一定 star 再建？
2. Discord vs Telegram——我们的目标用户更常用哪个？
3. 社区冷启动怎么做？前 100 个成员从哪里来？
4. 社区里需要什么 channel？general？showcase？help？
5. 谁来负责日常社区维护？需要多少时间？

## 十一、中文社群（V2EX / LinuxDO）

1. V2EX 的最佳发布节点是什么？创造？分享？程序员？
2. LinuxDO 适合我们吗？那里的用户画像是什么？
3. 中文开发者社区对"视频编程语言"这种概念的接受度？会不会太 niche？
4. 即刻适合吗？你在即刻上活跃吗？

## 十二、微信公众号

1. 需要一个公众号吗？还是借别人的号发？
2. 公众号文章的叙事和 Medium/Dev.to 文章应该有什么差异？
3. 需要做微信群吗？怎么管理？

## 十三、小红书 / B站 / 抖音

1. 这些平台适合开源项目推广吗？
2. B站做一个技术讲解视频有价值吗？
3. 小红书上开发者工具类内容有流量吗？

## 十四、TikTok / Instagram / Threads

1. 海外短视频平台适合推开源项目吗？
2. 有没有开发者工具在 TikTok 上做推广成功的案例？

## 十五、发布节奏与排期

1. 我们现在的准备程度——README 还没改，没有官网，没有文档站，没有社区——至少需要几周准备？
2. 你建议的发布日排期是什么？哪些渠道同一天打，哪些错开？
3. 发布前需要找 beta tester 吗？找几个？从哪找？
4. Product Hunt 应该和 GitHub 发布同一天还是错开？错开多久？
5. 需要预算吗？KOL 合作、域名、设计、视频制作——大概多少？

## 十六、发布后

1. 发布后第一周每天该做什么？
2. 怎么判断发布是否成功？哪些指标最重要？
3. 如果第一天 star 没达预期怎么办？
4. 如何把 star 转化成 contributor？
5. 如何把开发者关注转化成 Twinit 的 B2B 线索？
6. 开源项目的长期维护节奏——release cadence、changelog、roadmap 公开程度？

## 十七、商业模式

1. SVML 开源 + Twinit 商业化的 open core 模式，你做过 AFFiNE 有什么经验和坑？
2. 开源协议选什么？MIT？Apache 2.0？AGPL？对商业化有什么影响？
3. 开源项目拿投资，投资人最看什么指标？star？contributor？commercial traction？
4. AFFiNE 融资的时候，开源数据（star、fork、contributor）在融资中占多大比重？
5. 需要成立一个独立的 GitHub org 还是用个人账号？

## 十八、生态与长期

1. 怎么让第三方开发者为 SVML 写 Component（`.svk`）？
2. 需要一个 component marketplace / registry 吗？
3. SVML 作为语言，需要 LSP（Language Server Protocol）支持吗？VS Code 插件？
4. 什么时候该做 SVML playground（在线编辑器+预览）？
5. 能不能让 AI agent（Claude Code、Cursor 等）直接写 `.svml`？这是不是一个重要的增长渠道？
