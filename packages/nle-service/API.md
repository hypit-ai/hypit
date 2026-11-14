# NLE Service 能力与适配器投影

> 状态：当前实现审计与应用协议。本文是 NLE Service、Action port 与适配器投影的权威规格；
> `hypit.nle@1`、`hypit.nle-view@1` 与 AVIR 的准确领域字段仍分别由对应 package 拥有。

NLE Service 的职责不是把浏览器按钮直接翻译成文件写入。它打开一个 NLE Project 和一个 Timeline View，
维护一次编辑会话，将有限的用户手势提交为领域事务，并提供可丢弃的 Timeline、Canvas、Inspector、
Programme、缩略图与波形投影。

HTTP 只是当前 Web Surface adapter。Desktop IPC、Codex tab 或 CLI 可以调用同一应用服务；端口、URL、
iframe、临时资源和运行时实现都不进入 NLE、NLE View 或 AVIR。

## 0. 后端能力与投影

NLE 后端不是一个 HTTP Server，也不是一组 CLI 命令。它由四层可组合能力组成：

1. `@hypit/nle` 保存作者事实、事务、revision、undo/redo 规则和 NLE→AVIR lowering；不认识文件系统和传输。
2. `NleService` 打开一份 Project 与 View，成为该会话的单写者，维护历史、保存、派生投影和异步 Action。
3. `@hypit/nle-local` 实现本地文件、组件包、媒体、Picture Terminal、Chromium 和 FFmpeg 的一次性执行端口。
4. HTTP、Desktop IPC、Agent Tool 和 CLI 只是投影。它们不重新定义事务、Programme 或执行语义。

| 能力 | NLE Service | HTTP adapter | `@hypit/nle-local` API／CLI | 适合的调用者 |
| --- | --- | --- | --- | --- |
| open／observe | 是 | `GET /api/nle` 等 | 否 | Workbench、Desktop、Agent Tool |
| Project／View mutation | 是 | transaction、parameter、spatial、placement | 不复制成文件 patch 命令 | Workbench、Agent |
| undo／redo／save／reload | 是 | 对应 Command | 否 | 长驻编辑会话 |
| Programme／Item preview | 是 | generation resource | 否 | 交互播放与时间线投影 |
| sparse frames | 可由 Action adapter 接入 | 暂无独立 Action | `captureLocalNleFrames()`／prepared variant／`nle frames` | Agent 检查静态状态 |
| focused review | 是 | `/api/nle/review` | local／prepared API、`nle review` | 同 Programme generation 的画面与声音检查 |
| final／focused export | 是 | `/api/nle/export` | local／prepared API、`nle export` | 最终交付或独立文件任务 |

### 统一调用口

`NleServiceOperations` 将长驻能力限定为三类请求：

- `observe()`：Snapshot、Timeline、Canvas、Inspector、空间能力、文件状态与 Action 状态；
- `command()`：Project/View transaction、参数、空间、素材放置、历史、保存与 reload；
- `action()`：Export/Review 的启动与取消。

这是结构化应用端口，不是一个通用 RPC 字符串路由器。资源字节、订阅和进度保持独立端口，不塞进 JSON Command。
Workbench HTTP 已使用这三类调用；Desktop IPC 和 Agent Tool 可以投影同一组 discriminated union，
不调用 Workbench route，也不启动 CLI subprocess。

### CLI 是拼装出来的应用

`@hypit/cli` 只拥有 terminal I/O、help、project-root context 和结构化 command dispatch。官方
Distribution 在 `bin/hypit.mjs` 中显式拼装 project、generation、media、NLE、Workbench、Runtime 等命令模块；
每个模块独占自己的 root command，重复 root 会在启动时失败。项目安装或 Source import 不会自动获得 CLI 权限。

这里有两种不同的组合：

- **应用组合**：Distribution 把 `createLocalNleCliCommandModules()` 等可信模块装配成一个 `hypit` 命令应用。
- **工作流组合**：Agent 或产品调用这些模块背后的 typed ports。多个步骤需要共享同一 snapshot 或 Programme 时，
  应在进程内组合能力，例如 `reviewLocalNleProject()`；不能让一个 CLI 模块调用另一个 CLI 模块来传递隐式状态。

CLI 适合有界的一次性文件任务，`--json` 在 stdout 返回一个机器结果，进度走 stderr。长驻编辑不能通过反复启动
`hypit nle transaction ...` 模拟长驻服务；它应调用 `NleService`，再由 Agent Tool、Desktop IPC 或 HTTP
投影同一会话。这样 CLI 可装配，而领域能力仍可直接组合。

## 1. 三层状态

```text
Facts（作者事实）
├─ NLE Project       hypit.nle@1
├─ Timeline View     hypit.nle-view@1
└─ package-owned Component values and parameters

Projection（可重建投影）
├─ Timeline Scene / Canvas Scene / Inspector Scene
├─ Programme document and resources
├─ storyboard / poster / waveform
└─ Project Media Library view

Session（一次打开期间）
├─ selection / playhead / playing / tool
├─ zoom / scroll / hover / snap guides
├─ pointer gesture draft / optimistic patch
├─ undo / redo / savepoint
├─ Project / View 各自的 persistence state
└─ pending command, preview generation and async Action state
```

边界规则：

- Facts 是唯一可保存的作品和编辑安排；Projection 删除后必须能重建；Session 关闭页面即可丢弃。
- AVIR 是 NLE lowering 后一次性的闭合视听 programme，不是第三份作者文件，也不承载编辑 revision。
- NLE View 的轨高、锁、分组与名称不改变 Programme。`editRate` 是编辑网格；预览采样策略由应用会话
  拥有，可以在打开时取其值，但不能以整个 View revision 作为 Programme 身份。
- Project revision、View revision、Programme generation、Media Library generation 和 Item Preview generation
  各自表达不同 owner 的变化，不能互相冒充。

## 2. Operation envelope

只有首次打开、显式 reload 和冲突恢复返回完整 `NleServiceSnapshot`。普通 mutation 返回有限 receipt：

```ts
type NleOperationReceipt = {
  readonly format: "hypit.nle-service-operation@1";
  readonly projectRevision: number;
  readonly viewRevision: number;
  readonly dirty: boolean;
  readonly history: {
    readonly canUndo: boolean;
    readonly canRedo: boolean;
    readonly undoLabel?: string;
    readonly redoLabel?: string;
  };
  readonly changed: {
    readonly project: boolean;
    readonly view: boolean;
    readonly tracks: readonly string[];
    readonly items: readonly string[];
  };
  readonly invalidated: readonly (
    | "timeline"
    | "canvas"
    | "inspector"
    | "programme"
    | "item-preview"
    | "media-library"
  )[];
  readonly programmeGeneration: number;
  readonly persistence: {
    readonly project: OwnerPersistence;
    readonly view: OwnerPersistence;
  };
};

type OwnerPersistence =
  | { readonly state: "clean" | "dirty" | "saving" }
  | { readonly state: "conflict" | "failed"; readonly error: string };
```

Receipt 不是中央事件日志，不落盘，也不用于恢复历史。它只说明本次已接受操作之后前端应 patch 哪些事实、
重读哪些投影。HTTP adapter 可以在迁移期附带局部 Scene patch；不能为了兼容旧前端永远附带整份 snapshot。

`hypit.nle-service-operation-response@1` 附带 receipt 和稳定 id patch：Project 返回根字段、共享值、Track 顺序与
受影响 Track；Timeline 返回 Track 顺序、最大帧与受影响 Track；Canvas 返回绘制顺序、画布与受影响 Layer。
顺序数组同时表达新增、删除和移动，未返回的对象保留前值。Timeline View 是有限的独立 owner，仍整份替换。
NLE 编辑不会改变共享的 Project Media Library，因此 operation response 不附带素材目录、open-only 文件路径或完整 snapshot。

所有修改作者事实的 Command 必须携带其 owner revision。revision 不一致时返回结构化冲突，不静默合并，
也不根据文件摘要、basename 或历史缓存猜测用户意图。

## 3. Observation

| Observation | 当前 HTTP adapter | 返回 | 缓存／失效 owner |
| --- | --- | --- | --- |
| Open NLE | `GET /api/nle` | 完整 Project、View、初始 Scenes、Media view、history | 仅 open/reload |
| Timeline Scene | `GET /api/nle/timeline` | 有限 Track/Item read model | Project + View + package observation |
| Canvas Scene | `GET /api/nle/canvas` | 当前 Picture layers 与空间框 | Project + package observation |
| Item Inspector | `GET /api/nle/item-inspector/:item` | base sections + package sections | 该 Item 及其共享值；不是全局 revision |
| Component Media Inputs | `GET /api/nle/component-media-inputs/:item` | package 声明的动态媒体位与当前 Media Asset | 该 Component Item + package authoring |
| Programme | `GET /api/nle/programme` | generation 对应的 HTML document | 输出相关 Project facts + preview policy |
| Programme resource | `GET /api/nle/programme-resource/:id` | invocation-local bytes | Programme generation |
| Item preview | `GET/HEAD /api/nle/item-preview/:item?kind=…&generation=…` | poster/storyboard/waveform | 该 Item 的 source interpretation/range |
| Media Library | 包含于当前 open；目标可独立读取 | project-root `media/` 投影 | Media Library generation |
| Export task | `GET /api/nle/export` | 当前 export executor state | export task id/state |
| Review task | `GET /api/nle/review` | 当前 focused review state 与输出路径 | review task id/revision/state |
| Application state | `GET /api/nle/events`（SSE） | persistence、external change、export/review Action | application sequence |

Observation URL、object URL、临时文件与 generation 都不写进作者文档。前端不得从资源 URL 反推出文件身份。

## 4. Command

### 4.1 Project transaction

`POST /api/nle/transaction`

输入是一个带 project revision 的 `NleTransaction` 和用户可读 label。领域命令 vocabulary 可以完整保留，
供 Agent、批处理和 package authoring 使用；Timeline UI 只暴露第 7 节允许的手势。

| Command family | Project 变化 | Programme | Timeline/Canvas | Item preview |
| --- | --- | --- | --- | --- |
| `project.update(name)` | metadata | 不变 | 标题 | 不变 |
| `project.update(canvas)` | canvas | 重建 | Canvas | 不变 |
| `component-value.*` | 共享 package value | 重建 | 用户 Item | 通常不变 |
| `picture-layout.*` | 共享空间值 | 重建 | Canvas + 用户 Item | 不变 |
| `track.add/move/remove/replace` | 层级与内容 | 重建 | Timeline + Canvas | 只处理受影响媒体 Item |
| `track.update(name)` | metadata | 不变 | Timeline | 不变 |
| `track.update(muted)` | 视听事实 | 重建 | Timeline/Canvas | 不变 |
| `item.add/remove/replace` | occurrence | 重建 | Timeline + Canvas | 对受影响媒体 Item 创建/释放 |
| `item.update(name)` | occurrence metadata | 不变 | Timeline + Inspector | 不变 |
| `item.move` | Programme placement/层级 | 重建 | Timeline + Canvas | 不变 |
| `item.trim/slip/retime/roll/ripple-trim/split` | 时间映射 | 重建 | Timeline + Canvas | 受影响 Item |
| `item.detach-audio` | occurrence/source use | 重建 | Timeline + Canvas | 原 Item 与新音频 Item |
| `transition.*` / `matte.*` | Picture relation | 重建 | Timeline/Canvas | 不变 |

### 4.2 Timeline View transaction

`POST /api/nle/view-transaction`

| View command | Programme | Timeline | 持久化 |
| --- | --- | --- | --- |
| `view.update(name)` | 不变 | 标题 | View |
| `view.update(editRate)` | 不直接改变作品；更新编辑网格与默认 preview policy | Ruler/quantization | View |
| `track-lock.set` | 不变 | 对应 Track | View |
| `track-height.set` | 不变 | 对应 Track | View |
| `group.*` | 不变 | 对应 Items | View |

View transaction 不进入 Project undo。是否为 View 单设 history 是产品决定；不能偷偷混入 Project history。

### 4.3 Inspector field edit

`POST /api/nle/item-parameter`

前端把所有 Scene 中标记为 editable 的字段提交到同一个入口，不识别 `nle-occurrence`、Picture Layout、
Component 参数、Operator Application 参数或共享 Component Value 的写入方式。Service 重新生成当前 Inspector Scene，
验证字段仍然存在且可写，再由 NLE-owned planner 或 package authoring 生成一笔普通 NLE transaction。
前端不能凭 DOM field 名写任意 JSON path；package 只声明有限字段与编辑语义，不拥有 Workbench DOM。

Operator 字段不因作用域分裂为两套 API。Service 从 Scene 的稳定 section id 反查
`adjustment(item)` 或 `occurrence(item, picture|audio, application)` 地址，再交给同一个 package authoring。
最终事务只替换被寻址的 Application；浏览器不提交 Operator symbol、参数 JSON path 或 Item 全量快照。

### 4.4 Component Media input

`POST /api/nle/component-media-input`

输入为 Project revision、Component Item、package 声明的 input key，以及一个 Project Media Library id；`media: null`
表示移除。Service 重新读取当前 package Media input 声明，检查所选 Media 是否具备要求的 Picture/Audio 信号，
再把项目素材转换为相对 NLE 文件的 `NleMediaAssetReference`，提交一笔 `item.replace`。浏览器不提交文件路径、
`PreparedMedia`、任意 JSON path 或 Component 全量快照。该入口只连接项目 Media，不接受另一个 Item、Scene、
Canvas 对象或生成节点，因此不会形成通用 DAG 端口。

### 4.5 Spatial edit

空间作者能力先通过传输无关的 NLE Service 暴露。HTTP adapter 当前投影为：

```text
GET  /api/nle/spatial-authoring
POST /api/nle/spatial-command
```

Observation 返回当前 Project revision，以及每个 Picture Item 的真实 owner、共享影响范围、Frame／Fit／焦点修改能力和
可链接 Layout。Command 是下列有限意图之一：

- `layout.replace`：替换当前 owner 的完整 `NlePictureLayout`；
- `frame.translate`／`frame.resize`：只改变外部 Item Frame；
- `fit.set`／`focus.set`：只改变 Source 进入 Frame 的适配与取景焦点；
- `layout.share`：把 Item-local Layout 提升为一份显式 Project Picture Layout 并链接当前 Item；
- `layout.link`／`layout.unlink`：显式绑定已有 Layout，或把共享值复制回 Item-local owner。

共享 Layout 的 mutation 只有在全部当前使用者所在 Track 均可写时成立；link／unlink 只修改当前 Item。Service 在提交时重新
计算能力并执行 View guard，不能相信客户端之前观察到的布尔值。Source crop、包内对象、阴影、动画 Transform 不伪装成
这些通用命令；它们仍由对应 Picture Operator package 的 authoring facet 解释。

`POST /api/nle/spatial-edit`

该入口保留为 Monitor 直接空间手柄的窄 adapter。输入是一个 Item 和完整 `NlePictureLayout`，等价于
`spatial-command` 的 `layout.replace`。Service 决定修改
Item-local layout 还是其显式引用的共享 layout，
并提交一笔 Project transaction。pointermove 只更新前端 draft；pointerup 才发送一次 Command。

### 4.5 Media placement

`POST /api/nle/place-media`

输入使用 Media Library 投影中的 project-relative asset id、目标 Track、精确位置与必要的常量图片 duration。
Service 将路径转换为相对 NLE 文件的 `NleMediaAssetReference`，读取已缓存的媒体解释，生成普通 `item.add`。
扫描和 manifest 读取属于 Media Library cache，不在每次 placement 或缩略图请求时递归执行。

### 4.6 History and persistence

| Command | 当前 HTTP adapter | 语义 |
| --- | --- | --- |
| Undo | `POST /api/nle/undo` | 撤销一个已完成的用户意图，revision 继续单调递增 |
| Redo | `POST /api/nle/redo` | 重做一个用户意图 |
| Save | `POST /api/nle/save` | 携带 Project/View revision，逐 owner 原子发布并返回各自 persistence state |
| File status | `GET /api/nle/file-status` | 观察 watcher 已发现的文件变化、当前 revisions 与两位 owner 的保存状态 |
| Reload external change | 目标独立 Command | 只在无本地未保存修改时替换 Session，或要求用户明确解决冲突 |

一项手势只创建一条 history entry。当前历史保存完整 `before Project` 和正向 transaction；redo 在撤销后
的精确状态上重放该 transaction，不再重复保存完整 `after Project`。后续可将完整 before 收缩为
提交时生成的逆操作／delta 和稀疏 checkpoint；这些仍只属于 Session，绝不写入 NLE Project。

保存不由浏览器发起为每次编辑配套的写文件请求。NLE Service 在短延迟内合并已经完成的事务并执行 autosave；
浏览器只观察 persistence state。Project 和 Timeline View 是两个文件 owner，不假装拥有跨文件事务：一侧发布成功、另一侧
失败时，前者保持 `clean`，后者保持 `failed` 或 `conflict`，重试只处理仍 dirty 的 owner。页面关闭前有 dirty 才提示。
Service watcher 持续观察两个路径；Agent 在外部修改 clean owner 时报告可 reload 的变化，在本地 dirty 时将对应 owner 标记为
`conflict`，禁止用旧内存静默覆盖。NLE Service 暴露传输无关的订阅；当前 Web adapter 将其投影为
`/api/nle/events` SSE，浏览器不轮询保存或导出状态。`file-status` 保留为显式查询和断线恢复接口；Desktop 可把同一订阅投影为 IPC。

## 5. Action 与 Resource

Export 是异步 Action，而不是长时间占用 mutation 请求：

```text
POST   /api/nle/export       start
GET    /api/nle/export       observe
DELETE /api/nle/export       cancel
```

start 输入 output policy（文件名、尺寸、帧率、质量、Picture target），立即返回 task state。执行器完成后发布
`exports/` 下交付文件；临时 Terminal product 仍是 Derived Render Product，不成为 Media Asset 或 NLE 引用。
Action 的并发控制、revision 与画幅校验、取消、进度和完成状态属于 `NleService`；HTTP 只解析输入并把
本地 exporter 适配成 executor。Desktop IPC 或 Agent Tool 使用同一 Action，不需要复制一套导出状态机。

Review 使用同样的异步 Action 语义：

```text
POST   /api/nle/review       start
GET    /api/nle/review       observe
DELETE /api/nle/review       cancel
```

请求携带 `revision`、输出采样、半开帧区间和其中严格递增的绝对证据帧。NLE Service 在接受请求时
克隆该 revision 的内存 Project snapshot；后续编辑不改变已经开始的 review。Review 与 Export 共用一个本地渲染
Action 槽，避免同一会话同时争抢浏览器、编码器和外部 Picture Terminal。

```json
{
  "revision": 14,
  "directoryName": "caption-handoff-r14",
  "range": { "startFrame": 900, "endFrameExclusive": 1050 },
  "frames": [900, 975, 1049],
  "pictureTarget": "html",
  "quality": "standard",
  "frameRate": { "numerator": 30, "denominator": 1 },
  "resolution": { "width": 1080, "height": 1920 }
}
```

Service 将输出发布到 `reviews/<directoryName>/`，state 只返回 project-relative path、发起 revision、区间、Programme
总帧数、review 帧数和证据帧路径。目录已存在时准确失败，不覆盖旧证据。

Headless Agent 也可以直接调用 `@hypit/nle-local` 的 `reviewLocalNleProject()`／`hypit nle review`。一次性调用在
同一次包加载、媒体绑定、AVIR link 和 Terminal acquisition 后，从同一已关闭 Picture Programme 产生局部 MP4
与 PNG。长驻 Service 则让 Preview、Review 和 Export 复用当前 `PreparedNodeNleProgramme`：它由
`programmeGeneration` 拥有，只保存已链接 AVIR 和输入资源；range、帧率、尺寸、HTML／GPU 终点与输出目录仍是
Action 参数。每个 Action 使用可丢弃的 writable overlay，临时 Terminal product 不写回长期 Programme 资源域。
这不是 Project mutation、Result、持久缓存或跨 generation 猜测。Service 使用发起时的内存 snapshot，不能先偷偷
保存文件再让 CLI 重读。

Programme、storyboard 和 waveform 是 Resource projection：

- Programme 使用单调的 invocation-local generation。只有输出相关事实变化才递增；新 programme 就绪后前端原子切换，
  旧 iframe 在切换前继续可播放。
- Item preview 按 Item 与真实 source dependency 失效；移动、改名、轨高和锁不重解码波形／截帧。
- 大媒体采用可见区请求、固定 source-time chunk、pending 去重、有限并发和有界 LRU。不得使用内容哈希建立第二套身份。
- seek、stop 或新 generation 到来时，旧异步播放／解码结果必须丢弃；“最新播放位置获胜”。
- storyboard 元信息可通过 `HEAD` 观察，前端直接使用受控 Resource URL，不复制成长期 `blob:` URL；临时音频和
  旧 generation 资源仍必须在淘汰时释放，不等整个 server 退出才回收。

## 6. Interaction 与错误

NLE 当前需要的应用级 Interaction 只有文件选择、保存位置或外部授权等动作。普通 Timeline 手势、参数编辑、
播放与导出不需要任意 CLI 或任意文件系统入口。

错误 envelope 保持 `hypit.workbench-error@1`，并至少区分：

- Project revision conflict；
- View revision conflict；
- Track locked / package capability 不允许；
- unknown Item/Track/resource generation；
- invalid package parameter；
- persistence conflict / save failure；
- Action failed / cancelled。

冲突响应应带当前 owner revision 和可重新观察的入口；不能在错误分支自动重读后重放用户命令。

## 7. 前端可见操作

原则：只有手改明显比和 Agent 对话更方便的动作才提供直接手柄。领域模型支持某命令，不等于界面必须展示按钮。

### 7.1 始终属于 Session

- 播放、暂停、seek、拖播放头；
- 选择、取消选择、hover、marquee；
- Timeline 缩放、横向/纵向滚动；
- Monitor 的临时预览状态；
- pointer draft、snap guide、Escape/cancel。

这些动作不调用 Project mutation，不写 NLE/View，也不建立 undo entry。

### 7.2 Timeline 直接手势白名单

- 移动 Item；
- 拖左尾／右尾裁剪；
- 纵向拖动到已有 Track，或在边界位置创建同类新 Track 后移动；
- 必要的 split/cut 仅在产品明确保留且 package capability 允许时出现；
- Track mute、lock、height 等一眼可理解且比对话更快的控制。

roll、ripple、slip、retime、detach、compound 等可留在领域／Agent vocabulary，但不得因“已经有 command”自动进入工具栏。
可见 affordance 是“产品白名单 ∩ 领域可规划语义 ∩ Track/关系 guard ∩ package/Item capability”。Service 必须再次校验，
不能只相信前端隐藏按钮。Timeline presentation 只声明标题、内容层、配色和高度，不能授予编辑权限。

外边界时间与组件内部时间是两套能力：

- `start/duration` 描述 Item 的 Programme 范围；Present 的 `sourceTime` 采样 Source，Operator Application 的 `controlTime` 采样 Operator Control；
- Media 与嵌套 Composition 天然具有稳定 Source window；
- Component Source 和 Adjustment Operator 只有在 authoring facet 明确返回 `timeWindow: true` 时，才可使用通用 trim/split；
- Media／Composition Source 虽天然可切片，但只要 Present 含有内生 Picture／Audio Application，就还必须得到每个 Operator 的
  `timeWindow: true`；Source 与所有 Application 任一方不确认，前端都不开放边沿手柄；
- Caption unit、UI step、组件 keyframe 属于 package 参数。它们通过 Inspector 或未来有限的 point/range/boundary
  overlay 写回 package authoring，不能因为领域模型存在 `item.trim` 就出现 Item 外框裁边。

### 7.3 Monitor 与 Inspector

- 空间移动／缩放在前端保持 draft，pointerup 提交一个 Spatial Command；
- Inspector 只显示 NLE base field、共享值引用与已安装 package 声明的参数；
- 文本、数值、枚举和布尔值可以直接编辑；复杂结构由 package 提供有限 authoring operation，而不是万能 JSON editor；
- selection 改变时保留上一份已完成 Inspector，直到新 Item 投影就绪，避免短暂空白。

共享 Component Value 与 NLE Picture Layout 都通过当前 Project revision 的正向引用反查使用者。Scene 中的
`sharedBy` 只用于解释；Service 提交时必须重新计算所有受影响 Item/Track，并在任一使用者被锁定时拒绝写入。
Project 不保存 `usedBy`，也不建立中央 Style registry。

## 8. 客户端更新规则

当前实现的 `mutation → full snapshot → render() → replaceChildren() → recreate iframe` 必须退出主路径。

目标顺序：

1. pointer gesture 在本地 draft 中完成；
2. 前端乐观 patch 对应 Item/Track，并发送一笔 Command；
3. Service 校验 owner revision，commit 一次，返回 receipt 与稳定 id 对象 patch；
4. 前端按稳定 id patch Timeline/Canvas/Inspector，不销毁未受影响 DOM；
5. 若 `programme` invalidated，旧 programme 继续播放，Service 异步建立新 generation；
6. 新 generation ready 后保存当前 playhead/playing 状态并原子切换；
7. 失败则用明确的 authoritative patch 回滚本次 draft，不全页 reload。

首次 open、显式 reload、外部冲突恢复才允许整份 snapshot 和完整 render。

## 9. 当前实现状态与后续顺序

已经落地：

1. `NleService` 已成为一次打开期间的单写者：它拥有 Project/View 会话、事务串行化、undo/redo、
   文件戳冲突、保存和派生投影生命周期。HTTP Server 只解析协议、传输资源和投影该服务；Desktop IPC、Agent Tool
   或其他 adapter 可以直接复用 `openNleService`，无需启动端口。
2. NLE Project／嵌套 Composition 严格拒绝未知字段；View 允许仅位于开头的 `../`，Project Root containment
   仍由应用校验。
3. NLE Service 已按命令区分 Programme 与逐 Item preview 影响；generation 不进入 NLE 领域模型。
4. Programme identity 已脱离整个 Project/View revision；纯 View 操作和名称修改不再重建 Programme。
5. Timeline DOM 使用稳定 id patch；Inspector cache 按 Item 局部失效；Item preview 按 Item generation 失效。
6. Programme 使用旧 iframe 保持显示、新 iframe ready 后切换，并取消已过期的 document build；已开始的 Action
   通过自己的 snapshot lease 完成，不被后续 generation 偷换输入。
7. 自动保存使用 Project/View revision 和轻量回执；重新聚焦时检测外部文件变化，干净会话重载，dirty 会话拒绝覆盖。
8. storyboard 通过 `HEAD` 读取 sprite 元信息并直接使用 Service Resource URL，前端不再累积 `blob:` URL。
9. 普通 mutation 已返回 `hypit.nle-service-operation@1` receipt 和稳定 id operation patch；Project、Timeline、
   Canvas 只携带顺序、根字段与受影响对象，open-only 文件路径和未变化的 Media Library 不再随编辑返回。
10. Focused review 已同时落在三个层次：`reviewLocalNleProject()` typed execution port、拼装进官方 CLI 的
    `nle review` 子命令，以及绑定内存 Project snapshot 与 revision 的 `/api/nle/review` Service Action。
11. `PreparedNodeNleProgramme` 已统一 Preview、Frames、Review 与 Export 的 package resource、Media binding 和
    NLE→AVIR link；Service Action 按需获取发起 generation 的 prepared Programme，输出写入独立 overlay。
12. `NleServiceOperations` 已统一 Observation、Command 与 Action 分派；Workbench HTTP 已作为其适配器，
    不再直接选择各内部方法。Timeline 与 Canvas 也已有独立有限 Observation。

仍需继续：

1. **Programme 资源回收**：双缓冲已经取消 stale build，但旧 generation 的临时音频／Terminal product 仍需在切换
   确认后释放。
2. **Undo 存储**：已经移除重复的完整 after Project，redo 在精确 before 位置重放原事务；下一步再将完整 before
   收缩为逆操作／delta 与稀疏 checkpoint。
3. **大型媒体**：从整张 storyboard／waveform 深化为可见源区间 chunk、有限并发和有界 LRU。
4. **产品投影**：统一 Operations port 已经完成，但 Desktop IPC 与 Agent Tool 的具体 adapter 尚未接入对应宿主。
   它们应直接投影该 port，不使用浏览器路由或 CLI subprocess 代替。

历史 Desktop NLE 的行为记录可作为交互样本，尤其是一个手势一次提交、pointer capture/cancel、可见区缩略图、
分块波形和 stale playback cancellation。旧 `SVML/Film/Companion`、SHA revision、全文 undo、整项目 RPC、轮询和
React 自建渲染语义不是本 API 的实现基础。

