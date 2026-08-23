---
title: Studio Workspace 与 Inspector 信息架构审计
description: 记录左上资源工作区、右上组件工作台、Runtime 历史与数据依赖可见性的现状、原则和待调研问题。
---

# Studio Workspace 与 Inspector 信息架构审计

> 状态：调研记录，尚未形成实施规格。
>
> 本文记录 2026 年 8 月针对 Studio 左上 Workspace 与右上 Inspector 的一次信息架构审计。它固定已经确认的问题、系统边界和必须继续回答的问题，不固定最终标签名称、页面数量、协议字段、数据库迁移或实施顺序。后续调研可以推翻本文中的暂定方向，但不应绕过其中已经确认的职责边界。

## 一、为什么需要单独审计

Studio 已经拥有实时画面和时间线，开始能够承担“先把一个广告范例调明白，再批量生产”的视觉确认工作。但左上和右上仍主要是工程调试界面：左上只能看一份 Author Source，右上把实体身份、时间、来源、运行信息和参数堆在一条长列表中。

本轮参考了两类现有产品：

- 一张较新的剪映桌面端截图，用来观察资源浏览区和属性区的层级，不把剪映的完整 NLE 能力当作 Hypit 的需求清单；
- 旧 twinit 管理台的画布、任务、产物和节点工作台，用来分辨哪些产品思想仍有价值，哪些复杂度来自旧的中心化画布实现。

本轮不决定具体实现。尤其不因为视觉上像剪映，就先造出标签、空页面、项目数据库或新的缓存文件。

## 二、参考界面揭示的两套层级

剪映左侧和右侧并不是同一种导航。

左侧大致回答：

```text
资源领域
  -> 来源或集合
    -> 可浏览的具体内容
```

右侧大致回答：

```text
能力领域
  -> 当前组件下的子领域（可选）
    -> 参数组
      -> 参数行
```

这个区别对 Hypit 很重要：

- 左上应帮助用户找到这次制作涉及的 Source、执行和结果；
- 右上应帮助用户理解或调整当前选中的作者对象；
- 时间线继续回答对象何时发生；
- Preview 继续回答当前画面看起来怎样。

不能把左侧做成另一份 Inspector，也不能把右侧做成 Source、Run 和 Runtime 元信息的重复清单。

## 三、当前 Studio 的已确认事实

### 3.1 左上目前只有一份 Author Source

浏览器 Snapshot 目前只公开当前 Author Source 的路径和正文。Studio 服务端实际上已经知道更多内容：

- 当前 `.svrun`；
- 当前 Author `.svml`；
- 编译闭包里真实存在的 `.svml` / `.svs` 单元；
- 哪些文件处于本次 Studio 会话允许访问和写回的集合中。

因此“显示本次 Run 涉及的 Source”不需要扫描整个项目文件夹。缺少的是一个面向 UI 的 Source workspace 投影，而不是一个通用文件管理器。

### 3.2 右上目前没有足够的声明能力

当前 Studio adapter 只能声明一组粗粒度 Inspector section。参数声明可以表达名称、标签、少数控件类型、可写性和精确 Source range，却不能表达：

- 参数属于哪个能力领域；
- 是否需要第二级标签；
- 参数组的标题、次序和折叠关系；
- 更丰富但仍受 Studio 控制的控件呈现；
- 组件不同实体或附属 lane 的上下文差异；
- 哪些信息应进入参数区，哪些只应进入来源或关系视图。

当前 UI 因此按“语言 + 文件路径”给参数分组，并在每个参数下重复 Source 路径。这是现有协议不足造成的，不是单独调整 CSS 可以解决的问题。

### 3.3 未选择实体时缺少会话级信息落点

当前未选择实体时右上为空。与此同时，选择实体后又反复展示 Run、Target、Output、Candidate、Source 和 Writeback 等元信息。

这说明 Studio 尚未区分：

- 会话级元信息；
- 选择对象的身份；
- 可调整的作者参数；
- 只读的执行与来源关系。

“不重复元信息”不是简单删除信息，而是先为每类信息找到唯一位置。

### 3.4 Runtime 已经拥有任务和产物所需的主要事实

Runtime Host 已经能读取 Build Catalog、Build 状态、Operation、Dispatch、Queue 和 Artifact。Build Catalog 已记录 Source、可选 Run、公共别名、Build 与创建时间；Build Definition、Facts 和物化 State 保存执行图、选择、输入输出 Record、Need 与诊断。

当前 Studio Archive 只使用其中很小的一部分来解析当前 Run 引用的 `build-record` 和读取 Artifact。任务列表与产物历史主要缺少只读查询和 UI 投影，并不天然要求一套新的 Studio 数据库。

### 3.5 精确的数据依赖并未从底层消失

Build Graph 与 Build Plan 仍记录 Producer、输入 Record、输出 Record 和 Need；Build Facts 仍能保留实际执行结果与生成约束；Run 记录它选择的 Candidate；Studio 已经记录 Selection / Moment、Point / Window 和消费者之间的时间 lineage。

所以“某段 B-roll 来自哪些图片、哪个 prompt、哪个生成模型和 Provider，最后被哪条 Track 消费”在很多情况下可以从现有事实追踪。当前消失的是可读的解释视图，不是所有底层关系。

能否对所有包、所有历史 Build 完整回答这些问题仍需逐类验证，不能先假定覆盖率为 100%。

## 四、从 twinit 应保留与舍弃的内容

### 4.1 值得保留的产品思想

- 任务是按运行历史浏览的真实执行记录，不是临时日志窗口；
- 活跃任务只在相应页面可见时轮询，分页读取历史，避免后台持续拉取全部状态；
- 产物按生产来源组织，并能查看当次使用的参数或“配方”；
- 输入、素材、视频骨架、轨道、成片之间的依赖关系值得让用户看见；
- 选中一个作者对象后，右侧工作台应成为主要调整入口。

### 4.2 不应搬回 Studio 的旧复杂度

- 不能再引入一张与 SVML/SVS/SVRun 平行的可编辑 JSON DAG；
- 不能把图的位置、连线和保存 revision 变成第二套作者真相；
- 不能复制旧节点工作台中按节点类型集中硬编码参数、顺序和特殊分支的方式；
- 不能因为需要任务与产物视图，就先建立中心 Project / Canvas 数据库；
- 不能把旧画布中的全部生产、Pin、恢复和运行控制能力顺带塞进 Studio。

twinit 的完整 DAG 主要服务于编辑 workspace。Hypit 已由 Source 和 Run 推导 DAG，因此 Studio 更值得恢复“依赖可解释性”，而不是恢复第二个 DAG 作者界面。

## 五、已经确认的设计原则

以下原则可以先记录为稳定边界，但仍不等于具体 UI 规格。

### 5.1 Source、Run 和 Runtime 继续分离

- `.svml` 是 Author Source；
- `.svs` 是 Recipe Source；
- `.svrun` 是 Run Source；
- Runtime Profile 与 Runtime Archive 提供执行和历史；
- Studio 只是这些事实的读取、投影和受控写回界面，不拥有第二份作者状态。

### 5.2 左上不是裸文件系统

默认范围应来自当前 Run 的真实 Source closure、当前 Runtime Profile 和真实 Archive。不得遍历项目目录后把无关文件、临时文件或碰巧存在的媒体冒充制作资源。

是否还需要一个明确授权的更广“项目文件”视图，仍待调研。

### 5.3 任务不是新的实体，产物不是目录扫描结果

- 任务应建立在 Build、Dispatch 和 Operation 上；
- 产物应建立在 accepted Record、Logical Output 和 Artifact 上；
- 不为 Studio 再造 task.json、history.json、索引摘要、运行锁或内容哈希清单；
- 不复制 Artifact 到 Studio 私有目录来制造“素材库”。

### 5.4 Inspector 内容由组件声明，视觉与事务由 Studio 统一

组件及其 companion Studio adapter 应能声明自己需要展示的参数结构。Studio 仍统一拥有控件集合、布局纪律、主题、保存状态、并发 revision、错误呈现和写回事务。

组件不能把任意 DOM、React、CSS 或执行回调注入 Studio。否则第三方组件虽然“灵活”，Studio 的视觉和行为却会立即失去一致性。

### 5.5 参数布局不能成为新的值来源

无论最终采用几层标签，Inspector 字段都必须引用真实、精确的 Source 参数或明确的只读计算值。布局声明只决定如何展示，不保存一份影子参数，也不改变现有 `parameter.adjust` / `timeline.adjust` 的作者写回边界。

### 5.6 元信息只出现一次

会话级信息应有唯一落点；选中对象后只显示与当前对象相关的身份和能力。Source 路径、Run、Candidate、Output 等信息不应在每个参数行和每个普通属性组中重复。

### 5.7 关系视图必须只展示可证明的边

依赖关系只能来自 Source Map、Graph、Plan、Fact、Record、Candidate、Operation 与既有 temporal lineage。不能根据文件名、URL、时间接近程度或媒体内容猜关系。

缺少证据时显示“未解析”或不显示，不能补占位节点。

### 5.8 浏览功能不得拖慢 Build

任务索引、产物卡片、缩略图和关系视图都不能向 Build 关键路径加入新的慢操作。历史查询应分页；媒体按需加载；必要的预览派生只能在 Studio 浏览时惰性发生，并与 Build truth 分离。

## 六、仍属暂定的产品方向

下面只是当前看来合理的方向，不能直接当作字段和页面规格实现。

### 6.1 左上可能按三类资源组织

目前最自然的三个领域是：

- Source：当前 Run 涉及的 Author、Recipe 与 Run Source；
- Execution：当前 Run / Source 相关的 Build 和活动状态；
- Results：真实公共输出、生成素材和必要的中间 Record。

它们是否最终叫“源码 / 任务 / 产物”，是否都使用一级标签，第二级如何组织，尚未确定。尤其需要用真实项目验证左栏宽度、Source 编辑器与资源卡片是否适合共享同一个容器。

### 6.2 右上可能需要多层声明

当前观察支持一种“能力领域 -> 可选子页 -> 参数组 -> 字段”的层次。具体层级是否都必要、哪些能力名称由 Studio 提供、第三方能否声明新的大类、一个组件怎样在不同实体上下文中切换页面，都需要先做组件横向盘点。

可以确认的是：不能继续按 Source 文件路径自动分组，也不能让每个 adapter 完全自由地造一套 UI。

### 6.3 未选择时可能显示 Session 概览

可考虑集中展示当前 Author、Run、Target、Canvas、时基、Runtime Profile、Archive 可用性和诊断。最终保留哪些字段、是否需要标签、怎样保持安静而不变成调试仪表盘，尚需视觉验证。

### 6.4 依赖关系可能采用上下文谱系而非完整画布

当前更倾向于：用户选择组件、时间线条目或历史产物后，只展示它附近的一条或几条因果链；必要时再展开局部邻域。

这种形式有机会回答高价值问题，同时避免重新引入完整 DAG 编辑器。但关系放在右侧标签、独立抽屉还是产物详情中，尚未决定。

## 七、存储与查询方面的观察

现有 Build Catalog 是正确的起点，但当前读取接口只提供全量 `list()`，SQLite 里 Source 与 Run 又位于 `descriptor_json` 中。长期积累大量广告 Build 后，Studio 如果先全量读取再逐个查询状态，会形成不必要的扫描与 N+1 请求。

后续需要调研一个可分页、可限定当前 Run / Source 的只读查询面。是否应把已有 Source/Run 路径投影为可索引列、各 Runtime adapter 如何实现统一游标、哪些状态需要实时查询，尚未定案。

明确不考虑：

- 新的 Studio 专属数据库；
- Runtime lock 或历史摘要文件；
- 为项目关联生成内容哈希；
- 在项目移动后静默猜测它与旧绝对路径是不是“同一个项目”。

在没有显式 Project 身份的前提下，“当前 Run / 当前 Source / 当前 Runtime 全部历史”可能比伪造稳定项目 ID 更诚实。这个判断仍需结合跨目录复用工作流验证。

## 八、必须继续调研的问题

### 8.1 Source workspace

- 精确 closure 中怎样区分 Author、Recipe、Run 与普通导入单元？
- Source 文档的完整编辑能力应由什么 capability 声明，而不是按后缀猜？
- `.svrun` 的查看、完整源码编辑与组件参数写回应该如何区分？
- 项目本地组件源码和普通媒体资产是否需要进入同一个浏览区？
- Windows 路径、大小写、CRLF、文件监视与虚拟 Source id 怎样统一表现？

### 8.2 任务列表

- Studio 需要展示 Build、Dispatch、Operation 到什么粒度才足够支持 0-1 调试？
- 任务列表是否只读；取消、重试等运行控制是否应继续留给 CLI/agent？
- 活跃状态怎样廉价订阅或轮询，怎样避免不可见页面后台工作？
- 当前 Run、当前 Source 和 Runtime 全部历史的筛选语义是否足够？

### 8.3 产物历史

- 默认只展示公共 Logical Output，还是也展示生成过程中的媒体 Record？
- 应按作者输出、组件、Producer、Build 还是媒体类型分组？
- 同一输出的多次 Build 如何形成直观的 take 历史？
- 视频海报、filmstrip、音频波形在哪里惰性生成和缓存，如何不污染 Build？
- 点击历史产物后允许哪些动作：预览、下载、查看来源、生成 `build-record` 引用，还是更多？

### 8.4 Inspector 声明

- Studio 提供哪些受控的大类、控件和布局原语？
- 第二级标签什么时候隐藏，动态条件如何表达但不演变成 UI 编程语言？
- 重复 item、附属 lane、复合组件和跨文件参数怎样声明？
- 字体、颜色、媒体引用、空间矩形、动画阶段等控件是否都应进入第一版？
- project-local adapter 如何扩展而不依赖 Studio 私有实现？
- 参数的 Source 跳转、重置、错误和只读原因怎样以低噪声方式呈现？

### 8.5 数据谱系

- 对现有生成包逐个验证 prompt、参考图片、model、provider endpoint 和结果 Record 是否都可追踪；
- 从历史 `build-record` 回到原始 Build 时，跨 Build 链如何终止和分页？
- 一个最终 Track item 同时消费多个素材或复合 Surface 时怎样呈现而不退化成完整 DAG？
- temporal lineage 与生成 lineage 在 UI 中是合并的一条链，还是两个相邻视图？
- Source Map 缺失、旧 Build 格式或已删除本地 Source 时，降级信息是什么？

### 8.6 性能与生命周期

- 长期 Runtime Archive 的分页规模与查询延迟；
- 浏览器可同时保留多少任务、产物和关系详情；
- 哪些数据只在标签首次打开时获取，哪些数据可安全缓存；
- Studio Source revision 变化时，哪些面板失效，哪些 Runtime 历史保持不变；
- Runtime 不可用或没有配置时，左上如何降级而不影响已经满足的 Studio Run。

## 九、后续调研的验收方式

进入实现以前，至少应拿几类真实项目做纸面与交互原型验证：

- 只含 Author SVML、无 Recipe 的简单视频；
- 跨多个 SVS、含项目本地组件的项目；
- 生成图片再生成 B-roll 视频、最后进入 MediaTrack 的项目；
- 同一 Run 有多次 Build 历史和失败 Operation 的项目；
- Ranking Column 等一个根实体带多个可独立选择子实体的复合组件；
- 本地 Artifact Store 与远端 Artifact Store；
- macOS 与 Windows 项目目录。

调研结果至少要能回答：用户能否快速找到 Source、正在运行的工作、历史真实产物和当前对象的可调参数；能否解释一段素材从何而来；界面是否仍只有一份作者真相；后台是否保持安静；第三方组件是否无需修改 Studio 核心就能被正确组织。

在这些问题得到真实验证前，不把本文的暂定名词直接固化为 ABI 或存储格式。
