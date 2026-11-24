# NLE Studio 后端 API

> 本文记录联调时可调用的接口。请求和回执字段以
> [Studio 协议](../packages/nle-studio/src/protocol.ts)、
> [Editing Surface 命令](../packages/nle/src/surface/types.ts)和
> [Node HTTP 适配器](../packages/nle-studio/src/node-adapter.ts)为准。

## 左上角素材区

素材区默认打开「导入」，在同一个列表展示项目已接受的图片、视频和音频。这个列表读的是
**ProjectHost 持有的 Project Media Service**。该 Service 根据项目 `media/` 下的
`*.media.json` 重建 Catalog。同一 ProjectHost 下的 NLE 和 Canvas 等产品共享这份 Catalog。
Studio Session 调用 `project.media.observe()`，把 Catalog 投影成卡片所需的字段，并通过 Project Resource
Gateway 取得会话内可用的资源地址。素材 ID 是项目相对的 manifest 路径，例如
`media/aroll-alice/aroll-alice.media.json`。卡片名称使用 `media.displayName`，缺省时取清单文件的主名，
并显示主媒体文件的扩展名。
同一素材可以在多个 NLE 文档中被引用，每次放到时间线都会创建自己的 Item。
[Project Media Service](media.md#project-media-service) · [Studio Media 投影](../packages/nle-studio/src/host.ts)

素材来源栏和卡片使用固定宽度。桌面窗口中，素材面板最窄 328 px，默认 416 px，宽窗口里可拉到
704 px。视图、排序和筛选始终独立显示在搜索框右侧。空搜索框的「搜索文件名」随可用宽度从右侧截断并显示省略号。
「全部」指向素材库根目录。素材区可进入子目录、拖动素材卡片修改归属。
右键素材或文件夹可重命名、删除，右键内容区空白处可在当前文件夹新建文件夹。
项目应用在删除素材前检查已保存的 SVML 和画布，以及当前 NLE 会话中的时间线快照。

文件夹与素材共同参与排序。按导入时间排序使用素材的 `adoptedAt` 和文件夹的 `createdAt`，按名称排序
使用各自的显示名称。按时长排序时，无时长的项排在计时素材之后。同一时间或时长的项按名称排列。

卡片右上角以文字显示素材时长，长文件名在中间省略。左上角的「已添加」取自 `project.usedMedia`，表示这个 NLE 文档
已有引用，包括嵌套 Composition 里的素材放置和组件的素材绑定。编辑或撤销后，Studio 随 Project 投影更新标记。

以下 `api/…` 路径都相对于当前 Studio 会话 URL。第一次打开和重连读 `open`。Media Catalog
产生新 generation 后，Session 在事件流发 `media.catalog`，浏览器据此重读 `media` 等失效投影。
Project Media 采用成功会主动刷新 Catalog。直接改 `media/` 时需要显式刷新 Project Media Service
或重开 ProjectHost。Studio 的 `media` 观察读取当前 Catalog。
整理文件夹只发布 `media.library` 事件，使 `media-library` 观察失效。
[Project Media Service 实现](../packages/media-asset/src/service/service.ts)

| 用户动作 | 当前接口 | 当前行为 |
| --- | --- | --- |
| 打开素材区、刷新列表 | `POST api/observe`，`{ "kind": "open" }` 或 `{ "kind": "media" }`；`GET api/events` | 返回 `generation`、`derivedViews` 和 `entries`。每条包含 ID、名称、媒体类别和可用状态。成功读取 manifest 时携带导入时间 `adoptedAt`，其他字段包括 MIME、画面类型、素材时长 `duration`、按编辑帧率折算的 `durationFrames`、资源 URL 和诊断。 |
| 搜索素材 | 浏览器过滤 `media.entries` | 在「导入」集合里按卡片显示名称搜索，包含媒体文件扩展名。 |
| 切换视图、排序或筛选 | 浏览器浏览状态 | 网格和列表共享当前素材范围。默认按导入时间从旧到新，也可按名称和时长排序。排序菜单保持打开并按所选字段更新方向选项。支持图片、视频、音频筛选。`pictureKind` 为 `constant` 表示图片，为 `signal` 表示视频，纯音频从 `kind: "audio"` 识别。类型筛选只保留含匹配素材的文件夹，包含后代目录。 |
| 浏览素材文件夹 | `POST api/observe`，`{ "kind": "media-library" }`；`open.mediaLibrary` | 返回 `media/library.json` 的目录树和修订。未分组的素材显示在根，子目录可含素材和子目录。 |
| 框选素材和文件夹 | 浏览器选择状态 | 从内容区空白处拖动，与框相交的卡片被选中。贴边拖动时滚动，按 `⌘` / `Ctrl` 可追加，按 `Esc` 恢复框选前的选择。源素材预览单独维护。 |
| 整理素材库 | `POST api/media/library` | 传 `expectedRevision` 和 `folder.create`、`folder.rename`、`folder.move`、`folder.remove` 或 `asset.move`。目标为 `null` 时指向根。删除文件夹把直接内容移到上一级，子文件夹名称发生冲突时拒绝整次编辑。 |
| 重命名或删除素材 | `POST api/media/asset` | 传 `expectedGeneration`、素材引用和 `asset.rename` 或 `asset.remove`。重命名保存显示名。删除在通过引用检查后移除素材清单及其目录归属，保留媒体文件和附件。 |
| 素材卡片与列表预览 | `GET api/resources/:token`；列表画面和音频提交 `media.source-preview` | 接近视口时取样。网格用居中缩略图，列表用 50 px 高的全宽预览带。视频按整段源时间选帧，静态图复用同一张图。两者都等比铺满固定 3:4 的竖格并居中裁切。预览带绘制完成前在同一位置显示素材图标。音频按整段源时间选择分辨率，网格与列表使用同一个 Media 缓存并按实际宽度重画。 |
| 点选素材并预览 | `GET` 或 `HEAD api/resources/:token`，支持单段字节 Range；音频复用 `media.source-preview` 的波形数据 | 节目和素材共用播放器。图片完整居中，底栏置灰。音频和视频共用进度条，音频也能在波形上定位。素材时长以 Media 为准，显示到百分之一秒。打开文件夹、选中时间线片段或按 Esc 回到节目。 |
| 导入文件 | `POST api/media/import?name=…`，可带 `folder`，请求体为单个文件的原始字节 | Project Media 采用并写入项目 `media/`，按当前文件夹记录归属。回执的 `result.media` 给出素材 ID。浏览器逐个提交选中的文件。 |
| 系统文件拖入时间线 | 导入后调用 `POST api/operate` 的 `media.place-on-new-tracks` | 提交松手时的 Composition、工程修订、播放头帧和有序素材 ID 列表。新轨放在时间线最上方，混合拖入时画面轨紧接在音频轨上方。同类素材依次接排。这是一笔可撤销的 NLE 编辑，素材入库独立生效。 |
| 双击卡片、点加号 | `POST api/operate`，`media.place-on-new-tracks` | 用当前 Composition、工程修订、播放头帧和卡片的素材 ID，在时间线最上方新建对应轨道。 |
| 素材拖入时间线 | `POST api/observe` 的 `media-drop`，`POST api/operate` 的 `media.drop` | 预览和提交向同一规划器传素材、工程修订、时间和目标轨或轨间空位。预览返回片段时长、源时间和切点插入将后移的片段。 |
| 请求素材派生视图 | `POST api/actions`，`media.source-preview`、`media.thumbnail`、`media.storyboard`、`media.waveform`、`media.audio-preview` | 按素材 ID 和 `expectedMediaGeneration` 请求，取样使用 Media 时间。源预览按画面采样时刻和可选密度，或按波形层级和块编号取样，完成后经资源 URL 取结果。时间线根据 Item 的源时间映射请求同一套数据。 |

导入和放入时间线是两次独立操作。导入改变 Project Media，放置改变当前 NLE 文档。
素材第一次进入时间线后显示浮动片段。素材拖入和已有 Item 移动共用时间、轨道和轨间空位的寻址，松手时提交当前落点。
`timeline-drop` 观察用于已经在时间线上的 Item。
[素材区](../packages/nle-studio/src/browser/StudioBin.tsx) ·
[卡片预览](../packages/nle-studio/src/browser/MediaThumbnail.tsx) ·
[Studio 放置入口](../packages/nle-studio/src/browser/Studio.tsx)

素材区相邻的「新建」「字幕」「转场」「效果」读 `{ "kind": "catalog" }`。这个投影来自当前
Project 选择的 package offerings。组件用 `package` + `offering` 寻址，选中后交给
`component.materialize`、`adjust.materialize`、`process.materialize` 或 `transition.materialize`。
同一包可提供多个 offerings，每项可带自己的初始参数和默认值。
[Studio 的 package contributions](nle-studio.md#lifetimes)

### 素材区接下来逐项讨论

1. **发现和更新。** 先定素材区需不需要响应 Finder 或外部程序改动 `media/`。Project Media 已有
   `refresh()` 和 generation 通知，可以从这一层决定显式刷新或文件监听的行为。
2. **列表和预览。** 先核对项目变大、视频卡变多时的加载体感，再决定是否需要分页、后端搜索或固定海报。
   现有派生接口覆盖缩略图、分镜、波形和音频片段。列表交互目前需要素材名、类型、时长和可用状态。
   如果要展示像素尺寸、源帧率或更多媒体信息，先决定用在卡片还是单素材详情。
3. **放置和素材管理。** 先明确画面、音频及有声画面的落轨规则。若保留纯音频找空轨策略，可让一次
   `media.materialize` 把轨道选择与放置做完。素材改名、分组、删除、缺失文件重连属于 Project Media 的产品需求，
   需要先定身份和已有引用的行为。当前 Studio Media 管理入口公开了导入。

## 其余现有接口

### 会话、读取和订阅

| 入口 | 分类 | 现有能力 |
| --- | --- | --- |
| `POST /api/application/projects`、`POST /api/application/sessions` | ApplicationHost 生命周期 | 用项目目录打开 ProjectHost，再用项目句柄、产品 ID `hypit.nle-studio` 和文档路径启动 Studio。 |
| `POST api/observe` | Session、文档和界面投影 | `open`、`project`、`status`、`timeline`、`canvas`、`clipboard`。这里的 `canvas` 是 NLE 监视器的空间布局投影。 |
| `POST api/observe` | Inspector | `inspector` 和 `component-inputs` 以 Item 寻址，`transition-inspector` 以 Transition 寻址。 |
| `POST api/observe` | 策略、目录与能力 | `timeline-drop`、`media-drop`、`timeline-cuts`、`composition-actions`、`matte-sources`、`timeline`、`media`、`catalog`、`preview`、`delivery`、`action`。 |
| `GET api/events` | SSE | 发送 Project、Studio 会话、Project Media 的投影失效及 Action 进度。调用方按 `invalidated` 重读对应投影。 |
| `api/resources/:token`（`GET`、`HEAD`） | 字节资源 | 提供素材及 Action 结果。地址由 Session 投影或回执给出。 |

应用级会话和项目 lease 的完整入口见 [Host 后端 API](host-backend-api.md)。

### 编辑和持久化

`POST api/command` 接受 `{ command }`。`POST api/operate` 直接接受带 `kind` 的操作体。
编辑用 `expectedProjectRevision` 校验文档版本，用当前 Composition 和会话轨锁校验编辑目标。
回执给出 `status`、`changed`、`invalidated` 和可选 `result`。过期修订返回 HTTP 409。

| 入口 | 分类 | 现有操作 |
| --- | --- | --- |
| `command` | Owner 事务与历史 | `project.transact` 编辑 Composition、Track、Item、Group、Shared Value、Process、Transition、Matte 等。 撤销与重做使用 `project.undo` 和 `project.redo`。 |
| `command` | 预览区与 Inspector | `spatial.edit`、`inspector.edit`、`inspector.invoke`、`transition-inspector.edit`、`component-value.edit`。空间操作的 `crop.set` 写入当前 Item 的源画面裁剪比例，传 `null` 恢复完整源画面。 |
| `operate` | 时间线 | `timeline.drop`、`timeline.track-reorder`、`timeline.item-reorder`、`timeline.trim`、`timeline.slip`、`timeline.retime`、`timeline.roll`、`timeline.ripple-trim`、`timeline.split`、`timeline.remove`、`timeline.ripple-remove`、`timeline.close-gap`、`media.freeze`。 |
| `operate` | 放置与媒体绑定 | `media.materialize`、`media.drop`、`media.place-on-new-tracks`、`component.materialize`、`component-media.bind`、`component-media.unbind`、`audio.detach`。 |
| `operate` | 效果与转场 | `adjust.materialize`、`process.materialize`、`process.enable`、`process.move`、`process.remove`、`process.timing`、`transition.materialize`、`transition.replace`、`transition.resize`、`transition.remove`。 |
| `operate` | 遮罩 | `matte.bind`、`matte.remove`。 |
| `operate` | 会话轨锁 | `track-lock.set` 设置当前 Studio 会话的轨道锁。 |
| `operate` | 剪贴板 | `clipboard.copy`、`clipboard.cut`、`clipboard.paste`。 |
| `operate` | Composition 放置、复制和导航 | `composition.materialize`、`composition.compound`、`composition.duplicate`、`composition.make-unique`、`composition.explode`、`composition.enter`、`composition.select`、`composition.return`。 |
| `POST api/save`、`POST api/reload` | 持久化 | 写入或重读当前 SVML 文档。遇到磁盘写入冲突，用户可在确认后使用文件版本。 |

`project.transact` 中的 `group.link` 接受 Composition 与包含 ID、完整 Item 集合的 `group`。涉及已有组时必须包含该组的全部成员。
`group.unlink` 接受 Composition、组 ID 和要退出的成员。组内剩余成员不足两个时，这笔事务删除该组。

`media.freeze` 接收 `item`、`atFrame` 和可选的 `durationFrames`。`atFrame` 同时是采样与插入位置。定格插入原轨，从分割后的同轨后续片段出发，沿联动、转场和遮罩计算位移范围。分割、右侧位移和插入同一笔提交。

`timeline.trim` 接收 `items`、`edge` 和 `atFrame`。同一事务校验并裁剪这些 Item 的指定边，向外裁剪的上限由素材和同轨邻居共同决定。

`composition-actions` 接收 `selection: { composition, expectedProjectRevision, items }`，按当前选区报告创建复合片段、独立化和拆解的可用性。创建和拆解共用父时间线的放置规则，保留画面顺序和音频调节范围。`composition.make-unique` 原地重绑指定 Item。`composition.enter` 用外层 Item 的源时间映射定位内部播放头，返回时恢复父播放头。

`timeline-cuts` 观察接受 `cut: { composition, expectedProjectRevision, items, atFrame }`，返回播放头实际穿过的 `items` 和整批的 `split`、`trimStart`、`trimEnd` 可用性。单选媒体画面时，还返回默认时长的 `freeze` 可用性和阻挡原因。普通裁剪保留联动组，分割把左右两段留在原组。批量裁剪按最终状态校验关系。

`transition.materialize` 接收相接的两个 Item，或接收 `track` 和 `atFrame`。Studio 计算入场片段的同轨后缀及其联动成员，将位移和转场一起提交。

`transition.remove` 接收转场 ID。Studio 排除待删除的转场关系，再计算入场片段的后缀和联动成员，按当前交叠时长将它们后移，使两端重新相接。若后移受阻，整个操作失败。

`matte-sources` 接收内容 Item 的 `item`，返回可用的源 Item ID。没有候选时也返回阻止选源的原因。
`matte.bind` 接收 `content` 和 `source`，建立或更新该内容的遮罩关系。`matte.remove` 接收 `matte` 关系 ID。
两种操作都保留两端的轨道和时间窗口。

`project.transact` 中的 `composition.move` 以 `id` 指定时间线，可选 `before` 指定紧随其后的时间线。省略
`before` 时移到最后。位置保存为 SVML 中的 Composition 声明顺序。主时间线、当前打开的时间线和嵌套引用均按 ID 选择。

`project.transact` 中的 `track.update` 可分别写入 `pictureEnabled` 和 `audioEnabled`。画面开关影响叠画、
滤镜和遮罩贡献。声音开关影响该轨参与混音的音频，包括画面片段自带的声音。轨道锁由 `track-lock.set` 更新会话。

`audio.detach` 默认在原画面轨正下方新建一条音轨，并在原起点放置独立音频 Item。调用方可用 `track`
显式指定目标音轨。响应返回音频 Item 和目标 Track 的 ID。

### Seek、播放、派生视图、交付

| 入口 | 现有能力 |
| --- | --- |
| `GET api/programme/:generation/index.html` | 取得可复用的节目预览页。浏览器发送暂停定位或连续播放帧。页面在暂停定位绘制后回报。资源从同 generation 的 `assets/:id` 和 `source/:id/:frame.png` 读取。 |
| `GET api/programme/:generation/frame/:frame.png` | 读取本机执行器按当前 Programme 合成的精确画面。预览页在浏览器无法完成 Alpha 合成时使用。每个 generation 复用捕获页面与有界帧缓存，generation 回收时释放。 |
| `GET api/programme/:generation/audio/:frame.wav` | 读取从指定编辑帧开始的短 PCM 混音缓冲，无音轨时返回 `204`。Studio 按音频时钟连续排程并更新节目播放位置。 |
| `POST api/programme/:generation/activate` | 确认显示新一代画面，Session 据此回收旧版本。 |
| `POST api/actions` | 开始 `frame-preview`、`playback-preview`、`programme-waveform`、`picture.source-preview`、`audio.source-preview`、`delivery` 或上文的 Media 派生 Action。画面截帧使用时间线投影中的 `target`、`version` 和 1–24 个时间点，可选 `samplesPerSecond`（2、4、8、16、32、64，默认 2），返回固定采样区间、代表帧和源画幅。子 Composition 使用自己的时间轴，组件使用其所在 Composition 的时间轴。子 Composition 的音频预览使用 `target`、`version`、`samplesPerPeak` 和 1–64 个 `blocks` 索引，返回子 Composition 时钟上的混音峰值块资源。 |
| `GET api/actions/:handle`、`DELETE api/actions/:handle` | 查询 Action 状态、取消 Action。完成状态附会话内结果资源 URL。 |

联调时可以直接从已打开的会话地址读素材投影。

```sh
curl -sS -H 'Content-Type: application/json' -d '{"kind":"media"}' "${NLE_SESSION_URL%/}/api/observe"
```
