---
title: Runtime
description: Hypit Source 与 Core 之外的执行边界。
---

Hypit 把四个决定分开：

| 所有者 | 决定什么 |
|---|---|
| Workspace | 编译能读取哪些 Source 和本地素材 |
| Runtime Profile | 允许使用哪些环境包 |
| Local Runtime | 活跃 Build 如何持久推进和被观察 |
| 项目 Build Results | 每个 Build 实际完成了哪些公开 Output |

Core 是领域无关的状态机。它接收事实、派生 Command、验证 Record，不启动进程、不读取凭证、
不选择 Provider，也不知道 Build 最终是不是视频。

`@hypit/runtime-local` 是默认执行环境。它自己拥有 Worker、调度器、待提交状态、活跃执行状态和 SQLite。
这些是同一个本地实现，不再伪装成需要用户逐项选择的组件。

## Runtime Profile

Profile 只保留真正会随环境变化的选择：

```json
{
  "format": "hypit.runtime-local@1",
  "dataRoot": ".hypit/runtimes/local",
  "credentials": {
    "env": { "use": "@hypit/credential-store-env" }
  },
  "endpoints": {
    "media": { "use": "@hypit/provider-media-local" }
  }
}
```

官方视频 Distribution 在打开文件前已经明确选择 Local Runtime，因此 Profile 不再重复一个无法产生第二种
选择的 `runtime.use`。另一种应用若确实拥有不同 Runtime Host，应在自己的 Distribution 组装边界提供它；
Core 与通用 CLI 都不需要知道具体实现，也不预建没有第二个实现验证过的 Host 插件注册表。

`credentials` 选择凭证存储，`endpoints` 选择明确的 Provider 实现。Result 仓库不属于执行环境，
因此不能放进 Runtime Profile。

项目可以在根目录放置独立的 `hypit.results.json`：

```json
{
  "format": "hypit.build-results@1",
  "use": "@hypit/build-result-fs",
  "config": { "path": ".hypit/results" }
}
```

没有这个文件时使用同样的本地默认值。Runtime Profile 可以被多个项目复用，而每个项目仍拥有自己的
Result 地址。

安装包只增加一种可选实现，不会自动激活。Profile 不包含 Workspace、作者 import 或隐藏的
创作路由。

## 本地状态

选择 Profile 会写入项目指针，执行数据位于 `dataRoot`：

```text
.hypit/
  runtime
  runtimes/
    local/
      runtime.sqlite
      work/
      worker/
      programs/
  results/
    <UTC-date>/
      <build-id>/
        result.json
        files/
        values/
```

`check` 和 `plan` 不创建 Runtime 数据。提交时先建立不可调度的暂存行；Result draft、附件和工作目录
准备完成后，一个 SQLite 事务才会让这个 Build 可领取。硬中断留下的待提交状态只能由
`hypit result discard <build-id>` 精确删除；系统不扫描或猜测。

SQLite 的 Execution 只保存活跃执行事实、Provider Operation、`wakeAt`、当前 turn、取消请求、唯一 decision
和可选 attention；不保存 phase。每个活跃 Execution 有独立临时字节目录。Result 保存与工作目录清理完成后，
Definition/Facts、Operation、Catalog、容量票据和 Execution 根在一个事务中删除。Runtime 中不存在已结束
Build 的历史行。

持久 Runtime 的每个 Build 都必须在提交完成前提供项目 Result 地址和 Author Catalog。没有 Result 的
执行不会作为另一种隐藏模式存在。

历史内容属于所选的项目 Result 仓库，不属于 Runtime SQLite。使用默认仓库时，
`.hypit/results/<UTC-date>/<build-id>/result.json` 记录最终 Target，以及这条执行路线上真正完成的所有公开
Author Output；Resource 字节放在该 Result 的 `files/`，Composite Value Document 放在 `values/`，
领域数据与嵌套 Resource 的路径绑定彼此分开。`builds`、`history`、
`inspect`、`get` 和 `build-record` 都通过同一个仓库接口读取。提交给独立 Worker 的 Build 会带着
当时选定的项目仓库位置；之后修改项目配置或从别的目录查询，活跃 Build 仍使用该准确地址。

Author Graph 与 Run Graph 仍是两份完整的编译输入。Planner 全局应用所有 `satisfy`，求出替换后的依赖闭包，
然后才生成不可变执行 Definition：选中的初始 Record、Producer step、`Output → Record` 绑定、goal 与 Target。
Candidate id 和两张源码图都不会进入 Runtime 持久化。只有被该计划真正选中的零输入 Candidate 来源才会随后
读取，无论它指向本地值、本地文件还是历史 Output。历史 Output 若被直接选为公开 Output，Result 只保存一个
完整 Output 的转发地址；历史内容若被新 Operation 消费，则在 Build 生效前暂存一次，新产物照常属于当前 Result。

Result manifest 自己可以保存人类标题、备注和重点公开 Output。使用 `hypit result edit <build-id>`
修改的只是该 Build 的 `result.json`；它不打开 Runtime，也不建立项目级元数据索引。Studio 直接读取
这些字段，所以即使没有选择 Runtime，也能从 Result 列出历史 Build。

`running` 不是 Result 结论，也不是持久状态。Host 用活跃事实派生稳定的 `BuildView`：
`submitting / ready / running / waiting / saving-result`。CLI 和 Studio 只消费这个视图，不读取原始提交行或
Execution 持久记录。Execution 根据 `wakeAt` 与 turn 推进；
Execution 一旦写入唯一的 `complete / failed / cancelled` decision，就永远不能再被 Worker 领取。Result 在
接受公开 Output 期间没有 `outcome`，完成时写入与 decision 完全相同的 outcome。Result 或清理失败只增加
独立的 `attention = { step, error }`，不会改写 decision。历史浏览按 Build id 从新到旧只列出已有 outcome 的 Result；按
Build id 精确读取仍能看见 Result draft。

公开 Build id 固定为 `bld_YYYYMMDDTHHMMSSmmmZ_NNNNNNNNNN`。UTC 部分给 Result 自然时间顺序；末尾
随机串只用于避免同一毫秒冲突，不表达内容相等或复用。分页使用游标：`builds --before <build-id>` 与
`history ... --before <build-id>` 从上一页最后一个 id 之前继续。

使用 S3 或兼容服务时，项目的 `hypit.results.json` 改为：

```json
{
  "format": "hypit.build-results@1",
  "use": "@hypit/build-result-s3",
  "config": {
    "bucket": "my-video-results",
    "prefix": "projects/episode-12",
    "region": "us-east-1"
  }
}
```

AWS SDK 使用它通常的凭证链；兼容服务还可以配置 `endpoint` 与 `forcePathStyle`。`prefix` 是项目
边界，每个项目应使用自己的 prefix。S3 只改变完整 Build Result 的存放位置，不会把 Runtime
SQLite、Provider 容量或活跃 Build 的临时 Resource 搬进 bucket。

S3 adapter 会把有序 Build id 可逆地映射成“最新优先”的物理 prefix，因此对象存储可以直接返回有界
的一页，不需要中央索引或重复 catalog。Result 文件支持按字节范围流式读取，因此 Studio 预览远端
视频或音频时，不会先把完整文件装进内存。`hypit doctor [profile] --workspace <project>` 会同时主动
检查 Runtime 和项目选择的 Result Repository；存储检查只做一次有上限的只读列表，不扫描历史 Result。

Workspace 独立由显式 `--workspace`、Runtime 指针所在项目或入口 Source 目录确定。Runtime 配置
不能扩大源码读取范围。

## Execution turn 与并发

`build` 保存一个全新 Build 后立即返回。SQLite 持久保存所有仍需要下一轮推进的 Build；Worker 只在推进
期间临时物化状态，并立即写回已经接受的 facts。没有 Build 并发配置，Build 身份也不是容量资源。

真正约束外部工作的容量只有 Endpoint 声明的 Provider 总池与其下面的模型 Lane。不同 Build 的 Command
共享这些真实容量。每项资源只有一个 `limit`：立即调用返回后释放，异步 Operation 则一直占用到终态；
互不冲突的 Build 与 Command 可以一起推进。

异步 Endpoint 在调用 `start` 前先保存 Operation；立即 Producer/Endpoint 在调用前先保存 command
交接状态。进程若停在“已开始但结果未落盘”的窗口，该 Build 明确失败，同一个 command 不会再次调用。

取消是尽力而为：未开始的 Build 仍由 Worker 领取一次，但不会执行生成 Command，只写 Result
终态与清理；运行中的 Build 不再接收新 Command，Endpoint 可以尝试取消已经提交的外部 Operation。
已经完成并交接的 Output 保留，不做回滚。

## Managed Programs

Endpoint 可以声明 WhisperX 这类需要常驻的辅助程序。Endpoint 提供探测和可选启动命令，本地
Runtime 只负责管理它。

```bash
hypit programs status
hypit programs up
hypit programs down
```

`programs up` 会先准备所选 Endpoint 包的上游 npm 依赖，再操作其声明的程序。这些命令不打开
SQLite 或 Credential Store。

## 生命周期

```bash
hypit runtime init
hypit runtime use hypit.runtime.json
hypit runtime up
hypit runtime status
hypit runtime logs
hypit runtime down
```

`runtime init` 会把视频 Distribution 提供的起始 Profile 写入 `hypit.runtime.json`，并为已经解析
出的项目选择它；已有文件一律拒绝覆盖。这只是本地文件操作：不安装包、不连接服务、不索取凭据，
也不启动 Worker。官方起始 Profile 使用 HypiHub 提供远程生成、WhisperX，使用本地
Endpoint 处理媒体并通过 HyperFrames 渲染。这是 Distribution 的开箱选择，不是 Core 规则；使用
BYOK 或本地 Provider 时可以编辑 Profile 或选择另一份 Profile。

`runtime use` 把一份显式 Profile 绑定到一个已经解析完成的项目。项目来自 `--workspace`，
或当前目录声明的 package 边界；Runtime 选择不能反过来定义项目。命令只读取
`<project>/.hypit/runtime`，不会扫描约定文件名，也不会继承父项目的选择。即使几个项目声明
了等价的外部 Endpoint，它们也必须分别完成选择。

`runtime up` 先让 npm 把所选 Adapter 的精确上游包准备到机器共享目录，再准备所选的**本地**
Managed Program 并启动本地 Worker。它不会启动、重启、登录或探测 HypiHub 这类远程 Endpoint。
`runtime down` 只停止本地 Worker；由 Runtime 管理的本地 Program 会继续可用，直到显式运行
`programs down`。

`doctor` 才是主动但只读的环境检查。它解析已声明的凭据，并允许每个所选 Endpoint 检查真实
环境；远程 Provider 因而可以访问一次有界的模型目录或能力接口。登录成功只证明凭据存在，
doctor 成功才证明该账户此刻可以路由所选 Endpoint 声明的能力。普通 `check`、`plan` 和 Build 预检都不会运行这类
主动探测，也不会把环境检查偷换成隐藏网络请求。

`build` 不做部署：它执行便宜只读预检，只在就绪后提交，并确保
Worker 可用。`activity`、`cancel` 用来观察和控制活跃工作；`status` 分别读取 Runtime 与 Result，一边失败
不会伪造或吞掉另一边的事实。没有 Runtime 时，已完成 Result 也只证明 Result 的 outcome，不能反推 Runtime。

Result 写入或活跃状态清理失败时，decision 保持不变，并记录 `attention.step = result | cleanup`。修好外部
问题后，操作人显式执行 `hypit result finish <build-id>`。它打开一次性 Result writer，不启动执行 Worker；
只读取已保存的 Build facts、已结束 Operation 值、工作字节和固定 Result Repository，不加载或调用 Producer
与 Endpoint。Result writer 核对并写入同一个 Result，再删除工作目录，最后原子删除整个 SQLite 活跃聚合。
同一个 Build 同时只能被一个 Result writer 占用；这个互斥 lease 不是 phase，也不改变 decision。
进程若硬中断，下一 Worker 只撤销遗留 lease、记录 attention，不自动执行存储动作。工作字节丢失会明确失败，不补生成。
已结束 Build 不恢复；复用以前的 Result 必须在新的 `.svrun` 中显式写 Candidate。

运行中的 Worker 会在 Build 第一次需要某个已安装 Component 包时加载它。后续 Build 可以在
不重启 Worker 的情况下新增 Component 包；Worker 会沿完整依赖闭包只加载尚未见过的部分。
已经加载的包代码不会热更新，因此修改包代码或更新 Distribution 后，仍需等 Worker 空闲再将
其停止，然后提交下一次 Build。

Worker 记录启动时规范化后的完整 Runtime Profile。Profile 在 Worker 存活期间改变时，`status` 会报告
配置已变化，`up` 会拒绝静默复用旧进程，Worker 也会停止；重新启动才会激活新环境。这里保存的是活动
进程配置文本，不是哈希，也不进入 Build Result。SQLite 另外只固定当前活跃执行使用的 credential 与
Endpoint 选择，避免新 Endpoint 配置轮询旧 handle。

Runtime 包是本地可信部署代码，其安装版本由 npm 或 pnpm 管理。Hypit 只在显式 `runtime up` /
`packages install` 边界选择精确依赖并调用 npm，不维护第二份包锁，也不会把元数据冒充成沙箱。
