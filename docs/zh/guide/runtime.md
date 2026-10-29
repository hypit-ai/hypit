---
title: Runtime
description: 选择执行服务，独立运行 Build，并保留可持续使用的 Result。
---

Source 描述作品及其长期 realization 选择；Invocation 选择 Target 与可选的临时 override，
`.svrun` 可以保存这份 Invocation。Runtime 使用选定服务执行，项目把接受的材料作为普通作者资源保留。

| 部分 | 包含内容 |
| --- | --- |
| 项目 | Source、素材、组件包与选定的 Runtime Profile |
| Hypit 安装 | 命令与已安装的包 |
| Runtime Profile | Provider Endpoint、凭据引用、路由与共享容量 |
| Build | 使用选定工作和配置的一次执行尝试 |
| Result 仓库 | 已完成的公开 Output、执行结果和保留的运行证据 |

## 先确定项目，再选择 Profile

从 `package.json` 明确声明 `"hypit": { "project": true }` 的视频项目运行命令，或用
`--project` 明确指定项目。否则 CLI 向上寻找该标记。组件包、任意当前目录、Source 文件名和
Runtime 配置都不决定这个边界。

```bash
hypit paths
hypit runtime init
```

`runtime init` 写入可编辑的起始 `hypit.runtime.json`，通过项目的 `.hypit/runtime`
文件选择它。已有 Profile 会保留；此操作不安装、不登录、不执行。
起始配置提供 HypiHub 托管生成和 WhisperX，以及本地媒体处理、渲染。先按作品需要选择服务，
再准备它们。本地推理、项目 Provider 可以走同一条路径，也可以与 HypiHub 混合使用。

`hypit runtime use <profile>` 选择已有配置；`--runtime <profile>` 只覆盖当前命令。
命令只读取当前项目的选择，不继承其他项目的 Runtime。命令行相对路径以当前目录为基准。

## Runtime Profile

一个只配置本地媒体处理的例子：

```json
{
  "format": "hypit.runtime-local@1",
  "dataRoot": ".hypit/runtimes/local",
  "credentials": {},
  "endpoints": {
    "media.local": { "use": "@hypit/media-local" }
  },
  "bindings": {}
}
```

`dataRoot` 放活跃执行数据和工作文件，与 `.hypit/runtime` 选择文件分开。
`endpoints` 选择已安装的 Provider 及其配置。凭据通过选定 Store 中的引用获取，
密钥值不写进 Profile 或 Source。

只有一个兼容 Endpoint 时无需 binding；多个 Endpoint 都能提供同一能力时，用 binding
表达选择。例如已明确配置本地 WhisperX 后：

```json
"bindings": {
  "@hypit/whisperx@1#whisperx-transcription": "whisperx.local"
}
```

安装包使实现可用，选择它才赋予它当前环境中的角色。Model 拥有请求含义，Provider 拥有
服务支持、接口映射和价格来源。请求失败不会偷偷改用另一个账户。具体配置看所选 Provider 的 README。

## 按当前需要准备服务

本地媒体处理可以直接准备所选工具并启动 Worker：

```bash
hypit runtime up --endpoint media.local
hypit runtime status
```

只准备资源、暂不启动助手或 Worker 时，使用 `hypit programs prepare --endpoint media.local`。
通过 `hypit programs status --endpoint media.local` 查看就绪情况；检查配置或排查失败时，
使用 `hypit doctor --endpoint media.local`。按当前问题选择命令，不必依次执行所有检查。

本地媒体处理没有凭据要求。选中的服务若声明了凭据槽，再单独使用
`hypit auth status <endpoint>` 检查。例如，选择 HypiHub 后使用
`hypit auth status hypihub.default`，需要连接账户时执行 `hypit auth login hypihub.default`。

使用 Profile 里的实际 Endpoint 名称，可重复 `--endpoint` 选择多个；省略时覆盖整个 Profile。
`doctor` 读取配置、运行 Provider 的诊断，不提交生成。除了错误，也要阅读警告：有凭据或能读取
模型目录，不代表每种请求一定成功。没有选定 Runtime 时，doctor 只检查项目 Result。

`runtime up` 准备所选本地依赖和 Managed Program，再启动 Worker；它不登录或启动托管服务。
`programs prepare|up|status|down` 单独管理这些本地资源和助手。首次推理环境准备可能涉及大量下载，
应先比较本地准备成本和托管方式，再选择执行路径。

`hypit plan <source>` 检查当前工作需要的能力和轻量就绪状态。Source 可以是带显式 Target
的 Author Source，也可以是已保存的 `.svrun` Invocation Source。发现 Provider 能力需要可加载的包声明；
没有明确 binding 时，可能需要加载其他已声明 Endpoint。未使用的服务不必启动或登录。
`build` 不做安装准备：依赖已就绪时，按需启动 Worker 并提交一次 Build。
[Invocation 与 Build](../quickstart/run.md) 说明规划、价格、付费授权和显式复用。

## 执行独立于观察终端

```bash
hypit build build.svrun --follow
hypit status <build-id> --watch
hypit logs <build-id> --lines 80
```

Worker 拥有执行。`--follow` 和 `status --watch` 只是观察；关闭终端或等待超时不会取消 Build。
停止某一次尝试用 `hypit cancel <build-id>`。远程取消尽力而为，已经完成的 Output 会保留。

失败的尝试保持失败。把仍需使用的 Output 导出为项目资源、写入 Author Source，再由新的 Invocation 开启新的 Build。如果执行已经结束，
只是 Result 保存需要处理，`status` 会指出 `hypit result finish <build-id>`：它只完成待保存工作，
不会重新生成素材。

Build 日志保留 Provider 阶段和诊断。`runtime logs` 查看 Worker 启动和进程错误；
安装、服务日志属于相应 Managed Program。终端记录丢失不意味着执行证据也丢失。

## 共享容量，独立推进

多个 Build 可以同时推进。限制属于实际使用的账户、部署或本地计算资源。
远程等待不会占住一个整条 Build 的名额、阻止其他 Build 的本地工作。
Provider 可以分别声明任务容量和 submit、poll、collect 的短调用限制。
`hypit activity --verbose` 展示活跃工作和共享容量。

每个 Build 使用独立加载的项目实现和选定配置。修改项目组件或 Profile 影响下一次 Build，
已开始的工作保留已加载的实现。Managed Program 有独立生命周期，预热好的 WhisperX 可以服务多个 Build。

更新 Distribution 或改变 Worker 继承的 shell 环境，涉及进程生命周期。重启前检查活跃工作：
`runtime down` 会结束活跃执行上下文，`programs down` 单独停止助手。
执行器丢失会结束所属尝试，之后通过新 Build 显式复用。这种执行分离不是安全沙箱，
也不会冻结组件之后才读取的文件。

## 产物留在项目里

Result 位于运行 Hypit 的机器上、项目自己的 `.hypit/results`。本地电脑、SSH Linux 主机和
官方 WebUI 后端遵循同一规则：整套 Runtime 部署到那个宿主，不把队列、工作文件和 Result
存储拆到不同服务。需要长期归档或迁移时，在 Build 完成后显式处理这些文件。

Result 在公开 Output 完成时发布它们，最后保留终态。新 Output 可以引用已有文件，复合值内部也一样，
不意味着多一份素材。显式本地文件引用保持实时性；继续复用时需要保留它们的依赖。
需要交给人或其他工具的独立文件时，用 `get` 另行导出。

`builds`、`history`、`inspect`、`get` 读取项目 Result，不依赖原 Runtime。
精确存储和执行接口见
[Result 包](https://github.com/hypit-ai/hypit/blob/main/packages/result/README.md) 与
[本地 Runtime 包](https://github.com/hypit-ai/hypit/blob/main/packages/runtime-local/README.md)。
