---
title: Invocation 与 Build
description: 声明 Build 目标、复用结果以及配置运行时环境。
---

Author Source 定义视频本身。Invocation 选择最终目标，也可以临时选择 Output 的 primary realization 或另一个
已经存在的 Author Record。一次性调用直接通过 CLI 参数表达；需要具名和复用时再保存成 `.svrun`
Invocation Source。官方 Distribution 提供 Local Runtime；
它的 Profile 声明执行这份计划可用的凭据、Provider Endpoint 与服务。

先为项目选择一次 Runtime：

```bash
hypit runtime use hypit.runtime.json
```

日常制作只需要这条短路径：

```bash
hypit plan main.svml --target final.video
hypit build main.svml --target final.video --follow
hypit get <build-id> --output final.video --to output/final.mp4
```

快速开始只需全局安装一次 Distribution。此后本页所有命令都直接写作 `hypit`，在任何独立视频项目中都一样。

只有 `build` 会真正提交工作。`plan` 展示选中的工作；`check` 用于编辑源码，`doctor` 用于配置和排查部署。它们都安全，但不是每次 Build 前必须重复的仪式。

当项目包含多份 Author、Recipe 和已保存 Invocation 时，一种顺手的目录约定是：

```text
my-video/
  package.json              项目边界
  authors/
    main.svml               一份 Author 入口
    alternate.svml          确有需要时的另一份 Author 入口
  recipes/
    visual.svs              视觉 Recipe
    generation.svs          生成 Recipe
  invocations/
    images.svrun            一种执行意图
    takes.svrun             另一种执行意图
    final.svrun             最终交付意图
  assets/                   项目自己的输入素材
  kits/                     可选的项目内 Recipe Kit
  packages/                 作品需要时创建的项目本地 Author 包
  output/                   显式导出给人或其他工具的副本
  hypit.runtime.json        执行环境
  .hypit/                   自动产生的本地 Runtime 与 Result 数据
```

这只是方便人整理内容的推荐，绝不是强制的项目格式。小项目可以把多份 `.svml`、`.svs` 和
`.svrun` 直接平铺在根目录，其他项目也可以采用不同分组。Hypit 只服从 Source import、
`<author source="…">`、CLI 参数和 `get --to` 中明确写出的路径，不要求这些名字，也不会特殊识别
`authors/`、`recipes/`、`invocations/`、`assets/` 或 `output/`。每份已保存 Invocation 选择一份 Author 入口，而这份
Author Source 的闭包可以显式导入多份 Author 或 Recipe Source。受管理的 Result 仓库与它们分开，
零配置时仍位于 `.hypit/results`。

Invocation Source 与 Runtime Profile 不会悄悄改写视频。创作性的模型选择仍然留在 Author Source，或它显式导入的包里。

## 已保存 Invocation Source 语法

每个 `.svrun` 文件都以其处理指令开头：

```svml
<?svml using="@hypit/markup/invocation@1"?>
```

### 最简已保存 Invocation

```svml
<?svml using="@hypit/markup/invocation@1"?>

<svrun version="1">
  <author source="./main.svml"/>
  <target output="final.video"/>
</svrun>
```

| 元素 | 说明 |
|---|---|
| `<svrun>` | 根元素，唯一属性是 `version="1"` |
| `<author>` | 必需。`source` 指向 `.svml` Author Source |
| `<target>` | 一个需要得到的公开 Logical Output |

### Target

Target 表达这次 Build 的最终意图，通常是成片或另一个真正的交付物。Build 会完成 Target 所需的工作，而这条路上真正完成的每个公开 Author Output 都会自动进入同一个 Build Result。

### 多个 Target

可以在一次 Build 中请求多个输出：

```svml
<target output="final.video"/>
<target output="captions.track"/>
```

只有一次执行确实存在多个最终目标时才写多个 Target。需要复用的运行意图可以保存成不同的
`.svrun` 文件；一次性意图直接使用 CLI Target。两种形式形成同一个 Invocation，也可以共同指向同一个 Author Source。

## 复用已经产出的内容

Build Result 是执行历史。一个 Output 一旦要成为项目的长期素材，就先找到精确 Output，
再把它导出到项目中：

```bash
hypit history opening-generation.video
hypit inspect <build-id>
hypit get <build-id> --output opening-generation.video --to assets/opening.mp4
```

随后用拥有该含义的 Author 包声明文件，并把这个具名 Record 选择为生成角色的实现：

```svml
<import as="asset" from="@hypit/media@1"/>
<import as="realization" from="@hypit/realization@1"/>

<asset:Video id="accepted-opening" src="./assets/opening.mp4"/>
<realization:Select output={opening-generation.video} record={accepted-opening}/>
```

这是一次持久的作品编辑。字幕、时间线放置、视觉处理和渲染继续使用这段表演，不需要让
Invocation 或 Result 认识文件的来源。相机素材、下载文件、CLI 产物和生成 Result 都通过同一种
Author 声明进入作品。

如果只想在一次执行中使用 Output 的 primary realization，同时保留当前长期选择，可以写：

```svml
<override output="opening-generation.video" primary="true"/>
```

也可以临时选择 Author 闭包里另一个已经存在的 Record：

```svml
<override output="opening-generation.video" record="alternate-opening"/>
```

这个 Record 必须已经存在，并与 Output 类型完全一致。Invocation 不引入项目文件、值或计算，只保存
Target 和本次执行的临时选择。
每个被需要的 Output 都按同一顺序得到有效选择：Invocation override、Author Source 中的
realization selection，最后是 Output 的 primary realization。`plan --verbose` 会连同选中的 Record
一起报告该来源。

## Runtime Profile

官方视频 Distribution 已经选择 Local Runtime。它的 Profile 通过逻辑 `use` 名称选择 Credential
Store 与 Endpoint，并配置 Endpoint 容量等部署参数；它不选择 Runtime Host，也不定义 Source
Workspace、Author 包或项目 Result Repository。

```bash
hypit runtime init
hypit paths
```

`runtime init` 会写入视频 Distribution 提供的起始 `hypit.runtime.json` 并完成选择。它不覆盖
已有文件，不安装任何东西、不连接服务，也不启动 Worker。项目已有明确 Profile 时，使用
`hypit runtime use <profile>`；该命令只写入 `.hypit/runtime`。

`runtime use` 只写入 `.hypit/runtime`，不会启动 Worker、创建 Runtime 数据或修改已安装
包。Profile 结构和完整边界见 [Runtime](../guide/runtime.md)。
CLI 必须先确定项目：显式 `--project` 直接给出边界；否则向上寻找
`package.json` 中明确声明 `"hypit": { "project": true }` 的目录。组件包与任意当前目录不会
静默成为项目。随后只读取这个项目自己的
`.hypit/runtime`。它不会按约定文件名猜 Profile，也不会从父目录继承另一个项目的选择。
## 配置所选凭据

`check` 与 `plan` 不会请求在线 Provider。没有所选 Runtime 的 `plan` 只看图，不需要部署
凭据；有 Runtime 时，便宜预检会检查本次 Plan 所需凭据是否存在。在运行 `doctor` 或付费/
外部 `build` 之前，只配置当前 Runtime Profile 实际引用的凭据。先检查已有选择：

```bash
hypit auth status hypihub.default
```

需要的服务未就绪时，先决定配置它，还是选择其他支持的本地或托管方式。例如 WhisperX 可以在本机或通过 HypiHub 运行。起始 Endpoint 是配置起点，并不代表已经选择某个账户。

选择服务后，再连接其凭据：

已选择 HypiHub 账户时：

```bash
hypit auth login hypihub.default
```

其他所选 Endpoint 使用它声明的安全输入方式，例如 `hypit auth login images.personal`。
Provider 说明需要哪种凭据，Profile 选择存储方式；项目 Provider 沿用同一条路径。
如果使用环境变量存储，则按 Provider 的配置在 Worker 环境中设置。

不要把凭据写进 Author Source、Invocation Source、Runtime Profile 源文件或提交内容。`doctor` 会验证所需凭据是否存在，但不会打印秘密值。

## 查询所选 Invocation 的费用信息

```bash
hypit pricing reference.svrun
hypit pricing reference.svrun --json
```

所选 Runtime 决定每个请求由哪个 Endpoint 执行。`pricing` 读取对应 Provider 的费率信息，将匹配请求分组，展示已知参数与请求数量。明确声明为本地无 Provider 调用费用的工作汇总显示；未知价格、不支持的请求和价格读取失败继续可见。`--verbose` 补充本地请求细节与原始价格材料。

用报告说明准备怎么花费：所选账户、计划素材、计价单位与适用费率。命令读取价格，不提交生成，也不计算一个保证准确的总价。未来素材的时长可能还未知，估价时保留这部分不确定性。JSON 在 `groups[].requests` 中保留请求参数，在 `groups[].pricingDocuments` 中保留价格来源材料。

付费调用前，确认账户、工作范围和预算。已有授权覆盖约定内的工作；价格输出与登录成功提供信息，本身不代表同意花费。

## Build 工作流

不要提交凭据、生成媒体、Runtime 状态/数据库或日志。

### 0. 准备按需依赖

使用已发布的 Hypit 命令，无需在 Hypit 源码仓库运行 `pnpm install`。`runtime up` 会读取所选
Runtime Profile，把其 Adapter 声明的上游 npm 包安装到机器共享目录，并准备外部程序。项目
自己的组件和 Provider 仍是普通项目依赖，由项目的包管理器安装。只有 Profile 选择 WhisperX、
OpenCV 等本地 Python 程序时，才需要先安装 [`uv`](https://docs.astral.sh/uv/)。

官方 Distribution 提供 Fontsource 适配器；具体字体族是项目自己的普通依赖，应通过该项目的包
管理器加入，例如：

```bash
npm install --save-exact @fontsource-variable/inter@5.3.0
```

`hypit runtime up` 管理依赖、后台 Worker 和外部程序；`build` 不做部署准备。

#### 把正式视频项目放在 Hypit 仓库之外

作者文件不必位于本仓库之下。例如，项目放在 `/work/my-film`，同时复用
`/opt/hypit` 中已安装的包：

```bash
cd /work/my-film

hypit runtime use hypit.runtime.json
hypit plan build.svrun
```

项目在 Runtime Profile 之前确定；显式 `--project` 可以覆盖它，入口 Source 路径和
Runtime 选择都无权改变这条源码边界。`--package-root` 只定位已经安装的
`node_modules`；`--asset-root` 只额外授权读取素材字节。

外部项目通常应提交如下 `.gitignore`：

```text
.hypit/
output/
```

每次 Build 的权威结果位于 `.hypit/results/<UTC-date>/<build-id>/`：`result.json` 记录名字、状态、Target
和公开 Output，媒体在 `files/`，结构化值在 `values/`。

这个项目本地目录就是 Result 仓库；需要长期归档或迁移时，在 Build 完成后显式处理这些文件。
`builds`、`history`、`inspect` 和 `get` 从这里读取历史。活跃 Build 的临时 Resource 仍由 Runtime
在本机私有管理；要把一个 Output 变成项目素材，应显式导出并在 Author Source 中声明。

`status`、`builds` 等只读归档命令不会在状态尚不存在时初始化 Runtime 数据库。

共享只读素材库不必复制进项目，也不必放宽 Source 边界：

```bash
hypit plan /work/my-film/build.svrun --asset-root /work/shared-media
```

`--asset-root` 可重复使用，只授权读取素材字节，不允许从那里导入 `.svml/.svs` 源码。该 Host
选项不进入作者或 Build 身份；真正进入图的是由该文件形成的显式 Resource 值。

Runtime Profile 只选择 Credential Store、Endpoint 及其封闭配置。完整结构只在
[Runtime](../guide/runtime.md) 维护，不在 Quickstart 复制第二份。

### 1. 选择 Runtime

```bash
cd examples/podcast
hypit runtime use hypit.runtime.json
```

Author/Invocation Source 通过 import 选择作者包；官方视频 Distribution 已经选择 Local Runtime，Profile
只通过 `use` 选择 Credential Store 与 Endpoint。安装、版本与完整性由 npm 或 pnpm 负责。

### 2. 诊断环境

```bash
hypit doctor
```

Doctor 总会校验项目的 Result 仓库；存在已选或显式传入的 Runtime Profile 时，还会校验全部
Runtime 角色、Endpoint 配置、凭据是否存在和有界环境探测。它不启动 Worker，也不发付费请求。

存在 Profile 时，`doctor` 默认检查整个 Profile，也可以重复 `--endpoint <instance>` 限定服务。
若只想检查某次 Invocation 真正需要的环境，请使用带
所选 Runtime 的 `plan`。未就绪会写入 `preflight` 并令命令非零退出，但 JSON 中仍保留
冻结计划供检查。

### 3. 检查 Source 与计划

```bash
hypit check reference.svml
```

```bash
hypit plan reference.svml --target final.video
```

花费资金前审查所选工作。默认计划展示 Target、实际需要的外部请求及其已知参数；
`--verbose` 增加 Source 依赖，以及每个有效 Output 选择的 `invocation`、`authored` 或 `primary`
来源。选择 Runtime 后预检这次计划需要的 Endpoint、
凭据和外部程序，不启动任何外部工作。

`plan` 可以完全不带 Runtime；执行过 `hypit runtime use` 后，`plan` 和 `build` 都不必再写
`--runtime`。`build` 必须能找到所选或显式 Profile。

选择或改变 Profile 后，用 `runtime up` 安装所选上游依赖、准备本地 Managed Program 并启动
本地 Worker。它不会启动或探测远程 Endpoint；需要主动只读检查远程能力时使用 `doctor`。
`build` 只重跑便宜的只读预检；任何依赖或 Program 未就绪都会在提交前失败，绝不在 Build
中准备它们。若部署已经准备完毕而只有 Worker 停止，`build` 会在耐久提交前启动该 Worker。
`runtime status` 用于观察，`programs up|status|down` 只管理外部程序。

### 4. 提交 Build

```bash
hypit build reference.svml --target final.video --title first-cut --follow
```

不带 `--follow` 时，Build 在耐久提交后退出，后台 Worker 继续。带 `--follow` 时终端也只是观察者，并会报告进度变化；Ctrl-C 不会取消任务。

任何时候都可以重新接入观察：

```bash
hypit status <build-id> --watch
```

普通的 `status <build-id>` 只打印一次快照。`status --watch` 会在 Result 得到 outcome 时退出；脚本需要限制等待时间时可以加 `--max-wait-ms`。

| 标志 | 说明 |
|---|---|
| `--runtime` | 单次命令的 Runtime Profile 覆盖；通常用 `runtime use` 选择一次即可 |
| `--package-root` | 存放已安装包的 Host 目录 |
| `--project` | 显式项目边界，也是默认的 Source Workspace 根目录 |
| `--title` | 给这次 Result 一个供人阅读的标题 |
| `--follow` | 将 Build 进度流式输出到终端 |

每次执行都会创建新的 Build id，即使 Author Source 和已保存 Invocation 完全没变。关闭观察终端不会停止
Worker；但 Build 一旦失去执行上下文，这次尝试就结束，重启 Worker 不会恢复它。已完成的
Output 和记录下来的任务凭据会保留；需要长期使用的素材应导出到项目并写入 Author Source。

### 5. 检查并获取结果

```bash
hypit inspect <build-id>
```

`inspect` 直接读取项目 Result，默认展示 Target、高亮 Output 和失败证据。
`--output <name>` 精确查看一个 Output；`--verbose` 浏览其他 Output 和任务回执，
`--limit <count>` 扩展这个详细列表。导出指定 Output 用：

```bash
hypit get <build-id> \
  --output final.video \
  --to output/final.mp4
```

`get` 把一个精确的 `build + output` 地址导出到必填的 `--to` 目的地。`inline` 表示写成 JSON
文件；`file` 表示按原始字节写成一个文件；`value-document` 表示写成一个自足目录，其中
`value.json` 保存值与文件绑定，被引用的文件则按 Result 内的相对路径一起写入。目的地必须尚不存在。

Build 的最终输出会为每个文件 Target 打印精确的 `get --output …` 命令。查看 Output 用
`inspect`；`get` 只负责显式本地导出。

### 6. 在新 Build 中复用

按照上文 [复用已经产出的内容](#复用已经产出的内容) 导出被接受的 Output，在 Author Source
中声明它并加入 `realization:Select`。普通 Invocation 随后直接使用这个长期作者选择：

```bash
hypit build build.svrun --follow
```

### 7. 诊断或停止本地 Runtime

```bash
hypit runtime logs
hypit runtime down
```

`runtime down` 停止协调器及其执行进程，保留独立的 Managed Program。未完成的 Build 一旦
失去执行上下文，就不会在 Worker 重启后恢复；保留其已完成 Output 和任务凭据，通过新 Build
继续制作。已提交但从未开始的 Build 仍可开始。只有确实要停掉独立程序时才执行 `programs down`。
要取消某个 Build 的远程工作，应在其执行上下文仍可用时调用 `hypit cancel <build-id>`；
停止本地进程本身不会取消远程 Provider 任务。
