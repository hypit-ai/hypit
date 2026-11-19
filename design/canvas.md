# Canvas 后端和项目文件

> 一张 Canvas 对应一份项目文档。具体 Reader、类型和命令契约位于 owner 包内。

## Canvas 拥有的事实

Canvas 面向制作图片、视频或音频素材。执行能力是否可用由所选 Environment 决定；模型是否作为卡片出现，
由项目选择的 Canvas 目录决定。Canvas 通过 ProjectHost 提供的 Execution client 发送请求，不负责启动、
调度或恢复执行部署。参见 [ExecutionHost 边界](explicit-programs-and-execution.md#executionhost-boundary)。

Canvas 保存生成配方、带类型的输入关系、卡片布局、Invocation 附着和明确选中的 Publication
输出。一次运行针对一张卡片。卡片运行时解析当下选中的上游值，并把一个完整请求交给选定的
Execution Environment。Environment 管理账号、并发、运行状态、回执和产物字节。

一条连线只记录从哪个节点的哪个输出取值。执行顺序由发起 Invocation 的调用者决定。
上游尚无选中的完成结果时，Canvas 可以保存这条连线，
并在下游报价或运行时指出缺哪个输入。发起下游运行只读取这些值。用户可在运行之后改选上游，
新的选择只影响之后发起的请求。

持久的卡片名、位置、手动尺寸和产物选择随 Canvas 再次打开。当前选中卡片、镜头缩放、悬浮和拖动中的
临时状态属于 Product Session。进度、缩略图和预览 URL 由打开期投影提供。

## npm 包和运行时

| 单元 | 职责 |
| --- | --- |
| `@hypit/canvas` | Canvas Reader、序列化、事务和打开期 Service。 |
| `@hypit/canvas/node` | 同一发行单元下的文件适配和 Project Owner Provider。通过 ProjectHost 打开共享 Service，使用 Media 读取和项目的 Execution client 实现单节点准备、历史和采用。 |
| `@hypit/canvas-studio` | Canvas Product Provider、会话协议、本地 HTTP 适配和浏览器界面。 |
| Model 包，如 `@hypit/gpt-image` 和 `@hypit/seedance` | 确切 Capability、请求验证和输出定义。需要用于 Canvas 时，通过独立的 `./hypit` 入口发布创作目录项和端口描述，沿用现有模型配置中的选项、默认值、媒体角色和限制。 |
| `@hypit/execution` 和选定的 Provider | 报价、提交、观察、取消、Publication 和资源流。Provider 实现由应用或 worker 部署选择。 |
| `@hypit/hypit` | 在发行版里组装 Canvas Product Session 所需后端，并给 CLI 和 API 接同一组类型化操作。 |

Canvas Studio 和 NLE Studio 各自发行浏览器构建和产品协议。Canvas owner 依赖 Project 和 Execution
契约，可以独立用于项目程序。Model 和 Provider 依赖 Execution，Model 的结构化端口描述由项目的包选择
加载，供 Canvas、浏览器和终端读取。

`package.json` 和 lockfile 选择确切实现。项目的 `hypit.project.json` 选择加载的 Model 包和目录项。
Environment 独立报告本部署可用的 Capability。一个已安装但当前环境不可用的模型仍有可编辑的配方，
运行时显示环境诊断。已有节点的 Capability 解析与是否出现在添加菜单分开。

## Host 和打开期

```text
ApplicationHost
├─ Product Providers
│  ├─ NLE Studio
│  └─ Canvas Studio
├─ ProjectHost                              project/
│  ├─ Package Environment + Project Media
│  └─ Document Registry
│     ├─ NLE Project Service                edits/main.svml
│     ├─ NLE View Service                   edits/main.nle-view.json
│     └─ Canvas Service                     generation/opening.canvas.json
└─ Execution Directory ── 连接 ── ExecutionHost
                                  └─ Execution Environment
                                     └─ Invocation + Publication
```

发行版注册 Canvas Product Provider 和相应的本地传输适配器。界面调用者先在共享 ApplicationHost 打开
Project，再用项目 lease 和具体文档路径打开 Canvas Product Session。CLI 编辑与生成使用项目 lease。这条路径使用现有 Project
与 Product Session 的生命周期。Canvas 和 NLE 共享同一个 ProjectHost 的包环境、Media 和文档注册表。

Canvas 的 Node Owner Provider 使用 ProjectHost 的文档注册表打开 Service。同一 Project 内，同一
owner 和同一真实文件路径复用同一个打开的 Service。两个窗口打开一张 Canvas 时，共用修订、保存和变更事件。
打开另一份文件则有独立的 Canvas Service。首期已确认的卡片编辑由 owner 校验修订后原子保存，保存成功后
发布变更。拖动中的临时坐标和鼠标选择属于各自的会话。

Canvas Product Session 持有文档 lease，把作者事实、项目模型目录、Media 和已附着任务的观察投影成
卡片、连线和结果列表。它可以通过 ProjectHost 获取准入该项目的 Execution client，并通过短期资源
引用提供预览。会话关闭时释放文档 lease、订阅和预览资源。已接受的 Invocation 继续由 Environment
负责，再打开时按文件中附着的地址读取进度和结果。

Canvas Studio 在浏览器里处理镜头、吸附和手势反馈。移动和缩放卡片完成后提交一份修订事务。端口的可用性来自
项目 Model 描述及当前参数；连线建立、移除和检查器里的输入编辑提交相同的 Canvas 输入命令。将端口拖到空白处时，
新增卡片及其输入关系在同一事务保存。图片和视频预览通过 Product Session 读取 Project Media 或明确选择的
Publication 资源。

单节点准备、报价、提交及附着是项目作用域下的 Canvas 操作。其实现复用 Canvas Service 和 ProjectHost
提供的依赖，Canvas Product Session、CLI 和项目程序都可以调用。Product Session 负责观察、会话资源和
交互投影。Media 采用经现有 Media Service 独立提交，接受后的引用可被 Canvas 和 NLE 分别显式使用。

时间线和 Canvas 共享这套 Host 边界。时间线用 NLE Project 和可选 View 的修订规划编辑，预览和交付
调用本地影音执行器。Canvas 用一份 Canvas 的修订和明确选中的产物准备一张卡片，将生成交给
Execution Environment。两种 Product Session 可以同时打开，同一项目的素材采用会进入两边共享的
Media Catalog。

## Project Boundary

```text
project/
├─ hypit.project.json
├─ package.json
├─ pnpm-lock.yaml
├─ generation/
│  ├─ opening.canvas.json
│  └─ interview.canvas.json
├─ media/
│  └─ opening-shot/
│     ├─ opening-shot.media.json
│     └─ opening-shot.mp4
├─ edits/
│  └─ main.svml
├─ packages/
├─ scripts/
└─ exports/
```

`generation/` 是默认放置习惯。打开命令传入项目内的确切路径。一个项目可以有多张 Canvas，按镜头、
场景或试验自由组织。Project manifest 继续记录包选择，Canvas 文件自己记录节点。

一张 Canvas 用一份 `*.canvas.json`，同一事务写入配方、受影响的连线和卡片位置。文件内保留这些
事实的逻辑边界。加入或删除一张卡片只有一次修订检查和一次原子保存。Canvas 文件中的 Media 路径
相对于 Project Boundary，Publication 使用 Execution 地址。复制项目时，配方和已接受的素材可以
随目录迁移。附着的 Publication 仍需由其原 Execution Environment 提供。需要随项目交付的图片、
音频和视频可以先显式采用到 Media。

以下字段展示引用关系和持久化分组。精确结构由 Canvas Reader 定义。

```json
{
  "format": "hypit.canvas",
  "id": "opening",
  "name": "Opening shot",
  "nodes": [
    {
      "id": "still",
      "capability": "@hypit/gpt-image/gpt-image-2",
      "inputs": { "mode": { "value": "text" }, "prompt": { "value": "A glass city at dusk" } }
    },
    {
      "id": "motion",
      "capability": "@hypit/seedance/seedance-2.5-flash",
      "inputs": {
        "mode": { "value": "frames" },
        "prompt": { "value": "Slow dolly forward" },
        "firstFrame": { "from": { "node": "still", "output": "image" }, "personReference": false }
      }
    }
  ],
  "layout": { "still": { "x": 50, "y": 100 }, "motion": { "x": 460, "y": 100 } },
  "results": {
    "still": {
      "invocations": [{ "environment": "env.22222222-2222-4222-8222-222222222222", "invocation": "11111111-1111-4111-8111-111111111111" }],
      "selected": {
        "image": {
          "address": { "environment": "env.22222222-2222-4222-8222-222222222222", "invocation": "11111111-1111-4111-8111-111111111111" },
          "output": "image",
          "resource": "image-1"
        }
      }
    }
  }
}
```

选中项包含确切的输出和资源名。同一个 Invocation 可以产生多张图或多个音频资源，每次选择有明确
对象。结构化结果按具名输出读取，并通过其类型和目标 owner 的契约接收。正在执行的 Invocation
显示在卡片记录里。会话重新观察进度和结果时读取 Environment，选择动作由调用者显式发出。

## 后端调用

首个 API 和终端命令见 [Canvas 操作与终端接口](canvas-api.md)。

1. **打开和编辑。** ProjectHost 按 owner 和文件路径复用 Canvas Service。浏览器、CLI 和 Agent
   调用同一组观察和修订化编辑。文件结构验证检查节点、连线和引用形状。编辑时可以保留尚未填完整的
   需求，详细校验在准备报价或提交时由 Model 契约执行。
2. **准备、报价和提交。** 捕获 Canvas 修订和输入选择，将 literal、Media 引用与确切 Publication
   资源解析为一份 Model 请求和具名资源。报价与提交共用这份准备逻辑。报价调用 `ExecutionClient.quote`；
   提交先保存附着地址，再调用 `start`。用户改选素材或移动卡片时，已接受的 Invocation 使用提交时的输入。
3. **观察和选择。** 通过 `get`、`publication` 和 `openResource` 读取 Environment 的事实。
   Canvas 提供有限投影和会话可用的预览能力。选择结果单独提交一条 Canvas 事务。
4. **采用。** 图片、视频和音频交给 Project Media 的接收动作。Node 端从 Publication 流到临时文件，
   调用现有 `adoptFile`。Media Executor 负责探测生成文件。完成后可以显式在 Canvas 新增 Media 卡片，
   或在 NLE 放置一个 Media occurrence。现有 Media 卡片可以直接用于生成请求。

保存附着地址和 Execution 入队是两条持久化边界。Canvas 先保存可查询的地址，
Execution 对同一地址只接受一次。重开时使用 [同地址查询](canvas-api.md#报价提交和恢复)。

## 在 Studio 工作

在 Application Home 选择 Canvas，输入项目中的画布路径，或运行 `hypit canvas open <path>`。通过卡片
右侧面板编辑配方和输入来源，拖动或调整尺寸后保存位置。生成历史可以预览、选择和采用。选择一个输出后，
连到该输出的下游配方会在下一次报价或提交时读取这一选择。
