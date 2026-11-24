# HTML 视听执行与导出 API

> 状态：当前 NLE 编译、HTML 与视频交付 Action 设计。

## 边界

一次交付固定一个 Project snapshot、已安装的项目包和输出 profile。NLE 交付编译器解析媒体、
组件和处理实现，计算素材的精确读取位置及 effects 的输入和控制值，生成资源闭合的 `HtmlProgram` 和
`AudioProgram`。Delivery Service 组装 `HtmlVideoDeliveryPlan` 并交给注入的 `HtmlVideoExecutor`。

```text
SVML / NLE Project snapshot + Project Media + selected render contributions
  -> NLE delivery compilation
  -> HtmlProgram + AudioProgram
  -> preview / waveform / video delivery
  -> optional Media adoption
```

执行器接收已关闭的程序和显式输出请求，负责浏览器、解码、混音、编码和封装的执行生命周期。
编译器在内部计算画面和音频共用的剪辑时间映射。预览和导出通过 `prepareNleCompilation` 请求所需的终端程序。

## npm 边界

- `@hypit/html-program` 拥有 Artifact 使用区间、Video Source 采样计划、稳定 Picture DOM、frame ABI 与画布；
- `@hypit/audio-program` 拥有 renderer-facing 连续音频图；
- `@hypit/html-video` 拥有交付计划和 Executor 契约；
- `@hypit/html-render-local` 拥有本机 staging、请求私有 HTTP、精确 Source-frame preparation、worker 调度、
  有界顺序合流和 `HtmlCaptureBackend` 契约；
- `@hypit/html-chromium-local` 提供 Chromium frame-buffer worker；
- `@hypit/html-electron-local` 提供 Electron encoded-stream 和 frame-buffer worker；
- `@hypit/media-local` 执行 `AudioProgram` 并封装最终视频；
- `@hypit/html-video-local` 装配浏览器、Audio 执行和 mux，成为本机 `HtmlVideoExecutor`；
- `@hypit/nle-delivery` 从 snapshot、Media 和 render contributions 编译终端程序，并拥有 Project 范围的
  Action handle、进度、取消与目标路径检查。

Project package 通过 `hypit.nle-render` 提供组件 Picture、Picture effect、Audio effect 或 Picture Reconstruction。
同一包也可提供 Inspector、Timeline 和 catalog。Project lockfile 选择版本。编译准备结果随该请求或接受的预览 revision
一起管理。[组件渲染接口](../packages/nle-delivery/README.md)

文字组件使用同一套有序字体引用。项目参数可以选择项目目录内的字体文件、已安装的 Fontsource 包和系统字体。
编译器按组件使用的字重和字形解析文件与字符子集，并将它们封装为有使用区间的 HTML Artifacts。HTML Program 为
解析出的字库使用专用 family 名。页面先显示请求范围内的画面，再等待字体加载完成，最后初始化组件并执行取帧。

本机组合层为一次 Executor 实例选择同一组 `ffmpegPath` 与 `ffprobePath`。`@hypit/media-local` 关闭并检查这组
工具；HTML Source preparation、Picture encoding、Audio execution 与 mux 复用该选择。未显式配置时从 Host
`PATH` 解析 `ffmpeg` 与 `ffprobe`。普通执行不安装工具，应用发行版或 embedding 负责提供可执行文件。

## `HtmlProgram` frame ABI

一个 `HtmlProgram` 包含完整 HTML 文档、有限帧域、Artifact 表与显式 Video Source 采样计划。静态依赖带有
保守的可观察帧区间；动态媒体只能通过 Picture 输入进入编译器拥有的 display plane。页面暴露：

```ts
interface HypitFrameProgram {
  readonly frameCount: number;
  prepare(): Promise<void>;
  applyFrame(frame: number): Promise<void>;
}
```

任意合法帧都可以独立请求。页面负责组件状态、Operator controls 与 DOM 合成。执行层按照 Video Source 计划
准备媒体帧，capture backend 只捕获完成后的画面。Chromium 与 Electron 共享 Programme、staging 和输出请求，
两个 renderer 使用同一组件逐帧语义。

全片交付选择完整节目范围，frame preview 选择一帧对应的精确范围。编译器按输出帧率确定节目采样点，
并为每个采样点计算素材取帧位置。空间编译先在源画面坐标里应用 Item 的裁剪，再按布局适配到 Item 外框。
`cover` 的越界部分在外框截住，局部 Process 使用适配后的 Item 坐标。组件局部时间、媒体取帧和 controls 随帧求值。
一个 `HtmlProgram` 执行整个已选画面。Studio 的暂停定位发布当前 Composition 的画面 Programme，
连续定位复用同一个浏览器文档和组件运行实例。浏览器按目标帧加载参与合成的素材，兼容的视频流通过
原生媒体解码器取图，其余按 Programme 已关闭的 Source position、stream、Picture interpretation 和
采样边请求精确源帧。目标帧就绪后，这两条路径都将图像交给同一个 Picture 合成平面。

Studio 连续播放驱动同一页面。兼容的正向映射使用浏览器连续解码、切点预读和漂移纠正，其他映射按
已关闭的样本逐帧求值。音频执行器按 Programme 的样本边界提供短 PCM 缓冲，浏览器通过 Web Audio
连续排程，并用同一音频时钟驱动节目时间。

`applyFrame(frame)` 的完成是截图屏障，不只是一次同步 DOM 写入。HTML Visual 可以监听 `hypit-frame`，并通过
事件 detail 的 `waitUntil(promise)` 把当前帧所需的异步就绪工作加入屏障。这个协议只等待当前输出帧的资源与
状态；它不把前后帧执行顺序写进 Programme。

Alpha 合成在同一画面 Programme 中绘制两路透明画面，再以遮罩源的 Alpha 乘上内容的 Alpha。Programme
用 HTML-in-Canvas 绘制两个输入，等待当前帧的视频、图片及组件状态就绪后完成合成。随机定位、播放和导出
都在该帧的合成完成后交付画面。Electron 场景窗口显式启用 HTML-in-Canvas。Studio 在浏览器缺少合成能力或
画面合成失败时，让本机画面执行器运行同一个 Programme，把完成合成的帧交回预览页。
沙盒 Programme 将输入组件声明的图片资源绑定到自己的文档来源。组件引用媒体时沿用同一套资源声明。

Video Source 为每个输出帧保存精确的 Source position、`before`／`after` 边、selected stream 与 Media owner
关闭的 Picture interpretation。本地执行在请求私有目录中建立 selected stream 时间戳索引，以 FFmpeg 按解码
序号准备准确 PNG，再通过同源私有 HTTP slot 交给页面。离线捕获使用显式流和解码帧。交互浏览器等待
原生媒体解码完成和合成绘制。第 0 帧、随机帧、稀疏帧和连续离线交付服从同一精确采样规则。
映射读取显式选择 nearest-picture reconstruction 时，本地准备器以精确有理距离选择最近的已解码帧；其他未实现
的 reconstruction 在 terminal closing 时被准确拒绝，不能退化为默认 sided sampling。

Chromium/Electron 只负责页面合成与捕获。解码帧拥有有界字节容量、请求生命周期和完成后的清理；这些属于
`@hypit/html-render-local`，不进入 `HtmlProgram` 或 Project。普通浏览器播放可以使用 native video 路径；离线
执行器通过显式的 prepared-source-frame ABI 选择精确 bitmap 路径。

本机取帧先索引所选流的呈现时间戳及关键帧，确定精确的 Source ordinal。有合适的入口时，FFmpeg 从较早的关键帧
开始解码，用所需帧的绝对呈现时间戳筛选。整组输出的时间戳与索引逐帧核对后才发布。无法核对时，从流起点按序号
解码。首个缺失 ordinal 启动最多 16 帧的解码窗口。当前截图所需帧持有 lease，邻近帧可预取，缓存按字节上限
驱逐。FFmpeg 对所选帧做 Picture conversion 和 PNG 编码。相同资源、stream 与 Picture interpretation 的多个
HTML Source 共享 probe、解码需求和驻留像素。

`HtmlProgram` 携带所选流的 presentation start。执行层把 Source-local 精确位置换算成容器时间戳，
与素材缩略图和 storyboard 共用 Media 的帧索引及 sided 选帧逻辑。

Chromium 自动并发以 Host CPU/内存导出的 browser ceiling 为上限，先用较小 live count 开始。worker 只领取约
一秒的连续输出批次；稳定批次的真实生产吞吐决定是否增加 worker，吞吐退化时在批次边界退休 worker。短片不
创建无法摊销启动成本的 browser；调用者指定数值 `workers` 时保持固定并发。调节只属于本次 Action，不改变
终端程序或输出帧顺序。

## Project Service 与 Action

每个打开的 Project Boundary 可以建立一个 `NleDeliveryService`。调用者传入 Project 内的 NLE 文档路径、目标
路径和显式 delivery profile。Service 打开 snapshot、解析 Project Media 与 package contributions，关闭终端
program，并把 plan 交给自身配置的 Executor。

Action 状态为 `queued -> running -> complete`，也可进入 `failed` 或 `cancelled`。完成状态携带
`MediaResource`。目标像素、帧率、背景、质量、renderer、采样率与声道数通过本次 profile 传入。输出文件在完成前属于 Executor；完成结果只有经过显式 Media adoption 才成为 Project Media。

HTTP、CLI、Agent 与 NLE Studio 都是该 Service 的调用者或 Adapter，不各自实现 lowering、浏览器捕获或编码。
本机 Chromium、Electron 和 FFmpeg 是由所选 Executor 管理的普通操作系统工具链。

默认 Node Application distribution 创建一个本机 `HtmlVideoExecutor`，把它作为普通构造依赖注入 NLE Studio
Product Provider；每个 Product Session 用该依赖打开 Project 范围的 `NleDeliveryService`。Service 的 Action API
由 Product adapter 直接投影，注入的 Executor 管理 FFmpeg 与 browser 进程。进行中的导出会保留断开连接的浏览器
Session，直到导出完成、失败或显式取消。Application 关闭时会结束其交付服务。

Studio 对当前接受的内存 revision 复用同一次编译准备。Frame preview 选择一帧精确范围，通过
`HtmlFrameExecutor` 请求 PNG。Playback preview 选择一个精确范围，通过同一视频 Executor 生成有声 MP4。
Picture lowering 将完整的 Composition 等比居中适配输出画布。组件仍在各自的局部坐标中求值。
Audio executor 将 Item 的读取、嵌套 Composition 和所选 Media Audio member 的映射合成为同一条分段线性关系，
在 PCM 采样网格上关闭读取和落点。支持正向恒速和多级无回绕映射。FFmpeg 对非 1× 的正向读取保音高，
每段仍以目标 PCM 样本数为准。Control 同样求值多级分段线性映射，并在间隙沿用最近经过的边界值。
混音在完整节目时钟执行，裁切后的段保留节目落点。播放、交付和 Programme 波形从这同一张图按样本裁切，
Picture 使用同一范围内的帧采样。
本机 Executor 在视频文件保持一致时复用有限数量的源帧时间戳索引。取帧继续使用本次 Action 的精确采样计划。
Studio 持有临时结果并发布会话资源 URL。

时间线画面条通过 `HtmlFrameExecutor.openCapture` 对同一份 HTML Program 多次读取帧。Executor 在打开时准备
页面和资源，视频源帧按读取位置解码。关闭时释放 Chromium 页面、资源服务和临时文件。

Programme 波形使用相同的 Audio lowering、混音图和输出采样区间，将已裁切的混音转换为峰值 PNG。该 Action
不需要启动浏览器。它与画面预览分别保留各自最新结果，两者都随接受的编辑 revision 或 Media Catalog 变化失效。

## 当前生产路径

`examples/ranking-jensen` 是当前端到端 Project。`film.svml` 包含 5 段 A-roll、图片叠层、ranking component、
caption、BGM、SFX、闪屏、Picture processes 与 transitions。路径从 ProjectHost 读取 snapshot，解析 Media 和
四个 Project packages，编译 `HtmlProgram` 与 `AudioProgram`，通过本机 Executor 输出 720×1280、
24 fps、58.208333 秒的 H.264/AAC MP4。

Picture Source、Picture Operator 与 Audio Operator 的实现由选定 package contribution 提供。通用执行层只处理
封闭的 Program 与资源，不按 caption、ranking、filter、transform 或 gain 的 package 名称建立分支。
