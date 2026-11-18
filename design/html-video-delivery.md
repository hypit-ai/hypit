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
- `@hypit/html-electron-local` 提供 Electron encoded-stream worker；
- `@hypit/media-local` 执行 `AudioProgram` 并封装最终视频；
- `@hypit/html-video-local` 装配浏览器、Audio 执行和 mux，成为本机 `HtmlVideoExecutor`；
- `@hypit/nle-delivery` 从 snapshot、Media 和 render contributions 编译终端程序，并拥有 Project 范围的
  Action handle、进度、取消与目标路径检查。

Project package 通过 `hypit.nle-render` 提供组件 Picture、Picture effect、Audio effect 或 Picture Reconstruction。
同一包也可提供 Inspector、Timeline 和 catalog。Project lockfile 选择版本。编译准备结果随该请求或接受的预览 revision
一起管理。[组件渲染接口](../packages/nle-delivery/README.md)

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
并为每个采样点计算素材取帧位置。空间变换与裁剪关闭为静态布局，组件局部时间、媒体取帧和 controls 随帧求值。
一个 `HtmlProgram` 执行整个已选画面。

`applyFrame(frame)` 的完成是截图屏障，不只是一次同步 DOM 写入。HTML Visual 可以监听 `hypit-frame`，并通过
事件 detail 的 `waitUntil(promise)` 把当前帧所需的异步就绪工作加入屏障。这个协议只等待当前输出帧的资源与
状态；它不把前后帧执行顺序写进 Programme。

Video Source 为每个输出帧保存精确的 Source position、`before`／`after` 边、selected stream 与 Media owner
关闭的 Picture interpretation。本地执行在请求私有目录中建立 selected stream 时间戳索引，以 FFmpeg 按解码
序号准备准确 PNG，再通过同源私有 HTTP slot 交给页面。浏览器不负责解释容器默认流，也不以
`<video>.currentTime` 是否变化作为像素就绪证据。第 0 帧、随机帧、稀疏帧和连续交付服从同一采样规则。
映射读取显式选择 nearest-picture reconstruction 时，本地准备器以精确有理距离选择最近的已解码帧；其他未实现
的 reconstruction 在 terminal closing 时被准确拒绝，不能退化为默认 sided sampling。

Chromium/Electron 只负责页面合成与捕获。解码帧拥有有界字节容量、请求生命周期和完成后的清理；这些属于
`@hypit/html-render-local`，不进入 `HtmlProgram` 或 Project。普通浏览器播放可以使用 native video 路径；离线
执行器通过显式的 prepared-source-frame ABI 选择精确 bitmap 路径。

本机取帧先索引 selected stream 的精确时间戳并确定 Source ordinal；它不以时间 seek 近似该事实。首个缺失
ordinal 才启动最多 16 帧的顺序解码窗口；当前截图所需帧持有 lease，邻近帧只是 soft prefetch，并由字节上限
内的 LRU 驱逐。FFmpeg 只对该窗口执行 Picture conversion 与 PNG 编码。相同资源、stream 与 Picture
interpretation 的多个 HTML Source 共享 probe、解码需求和驻留像素。

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
由 Product adapter 直接投影，注入的 Executor 管理 FFmpeg 与 browser 进程，Product Session 关闭时取消其仍在
运行的交付。

Studio 对当前接受的内存 revision 复用同一次编译准备。Frame preview 选择一帧精确范围，通过
`HtmlFrameExecutor` 请求 PNG。Playback preview 选择一个精确范围，通过同一视频 Executor 生成有声 MP4。
Audio executor 在完整节目时钟上执行图，在输出边界按样本裁切并重置时间戳，Picture 使用同一范围内的帧采样。
Studio 持有临时结果并发布会话资源 URL。

Programme 波形使用相同的 Audio lowering、混音图和输出采样区间，将已裁切的混音转换为峰值 PNG。该 Action
不需要启动浏览器。它与画面预览分别保留各自最新结果，两者都随接受的编辑 revision 或 Media Catalog 变化失效。

## 当前生产路径

`examples/ranking-jensen` 是当前端到端 Project。`film.svml` 包含 5 段 A-roll、图片叠层、ranking component、
caption、BGM、SFX、闪屏、Picture processes 与 transitions。路径从 ProjectHost 读取 snapshot，解析 Media 和
四个 Project packages，编译 `HtmlProgram` 与 `AudioProgram`，通过本机 Executor 输出 720×1280、
24 fps、58.208333 秒的 H.264/AAC MP4。

Picture Source、Picture Operator 与 Audio Operator 的实现由选定 package contribution 提供。通用执行层只处理
封闭的 Program 与资源，不按 caption、ranking、filter、transform 或 gain 的 package 名称建立分支。
