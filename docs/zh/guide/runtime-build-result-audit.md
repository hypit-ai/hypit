---
title: Runtime 与 Build Result 实现审计
description: 已完成的生命周期修复、仍待处理的问题，以及后续修改必须守住的边界。
---

# Runtime 与 Build Result 实现审计

这份记录来自 2026-09-02 的实现审计。它不是历史 Build 的中央账本，也不定义第二套产品模型。

## 不可破坏的原则

- Build 是一次独立执行。相同输入再次运行也必须得到新 Build；同一个 Build 永不重跑。
- Target 只表达真正的终点。执行路线中已经完成的公开 Author Output 自动进入同一个 Result。
- 历史地址是 `build + output name`。新 `.svrun` 显式引用旧 Output；文件引用可以多次向前转发。
- Build Result 是历史内容；Runtime SQLite 只保存执行中的交接、调度、容量占用和临时状态。
- Resource id 只是一次执行内的不透明身份。禁止内容哈希、SHA-256、反向寻址、历史引用计数、
  中央 Artifact 表、Build 恢复系统和过度一致性测量。
- 只为已经发生的故障边界写精确回归，不增加泛化探测、批准流程或“国防式”测试。

## 本轮已经完成

### 1. Build id、顺序与目录边界

公开 Build id 已固定为 `bld_YYYYMMDDTHHMMSSmmmZ_NNNNNNNNNN`。UTC 时间使 id 自然从旧到新可排序，
末尾随机串只防止同毫秒冲突，不表达内容相等、复用或摘要。Runtime、SQLite、文件 Result 和 S3 Result
共用严格校验；`.`、`..`、路径分隔符、NUL 与首尾空白不能进入工作目录或仓库 key。

### 2. Worker 单实例与配置所有权

`runtime up` 使用原子 launch lock；Worker 启动后持有带 owner 与 PID 的 SQLite lease，只清除上一进程遗留的
turn/Result-writer 占用并记录需要人工处理的写入，再写 ready。启动超时会停止刚创建的子进程，`down` 只有在
lease 仍属于该 PID 时才会终止它。

进程记录保存规范化后的完整 Runtime Profile 文本，不保存哈希。Profile 改变后，旧 Worker 不会被
`up` 静默复用，并会在心跳时停止。SQLite 同时固定所有待提交和活跃 Build 使用的规范化环境文本；只要
仍有活跃 Build，另一份 Profile 就不能打开执行器，避免新配置轮询旧 Operation handle。
Worker 在每次回收或领取 Execution turn 前还会验证 lease 仍属于自己的 owner 与 PID；过期 lease 被其他
进程取得后，旧进程即使恢复运行也不能再领取 Build。

### 3. Result outcome 与活动执行分离

Result `sync()` 只增量接受公开 Output，不自行决定 Build outcome。Execution 也不再保存 phase；调度活动完全由
`wakeAt` 与当前 turn 派生。Worker 写入一次不可变的 `decision = complete | failed | cancelled` 后，该 Execution
永远不能再被领取。Result writer 写入 Result，随后删除工作目录，最后在一个事务中删除 Definition/Facts、
Operation、receipt、Catalog、容量票据和 Execution 根。

Result draft 没有 outcome；完成时写入与 decision 完全相同的 outcome。Result 或清理失败不会发明 blocked phase，
只在 Execution 上增加独立的 `attention = { step: result | cleanup, error }`。硬进程中断后，新 Worker 只记录
attention，不自动执行任何 Result 或清理动作。

Result 写入另有一个只用于互斥的 lease，防止 Worker 与两个操作命令同时写同一个 Result。它不是
生命周期 phase，也不改变 decision；收尾成功时随 Execution 一起删除，失败时先记录 attention 再释放。新 Worker
接管 Runtime 时只撤销上一进程留下的 lease 并要求显式继续，不据此重放任何外部动作。

修好存储问题后，操作人显式运行 `hypit result finish <build-id>`。CLI 直接打开独立 Result control，不启动
通用 Worker。Result writer 只读取已经持久化的 Build facts、立即 Command 回执、已结束 Operation 值和工作字节；
它不安装 Runtime Endpoint，不进入 Scheduler，也不调用 Producer 或 Endpoint。工作字节确实丢失时，Build
继续保留 decision 与 attention 并报告原因，不补生成。Result 已完成但 writer 状态删除失败时，下一次显式
继续会核对同一 decision 并继续删除 writer；不同 decision 会直接报错。

### 4. Command 与 Operation 不重复调用

异步 Endpoint 在 `start()` 前先写入 Operation。只存在 submitting 行而没有 Provider handle 时，Build
以 `SUBMISSION_UNKNOWN` 失败，不会再次提交远端任务；已经完成的 Operation 在取消收尾前先交给 Core。

立即 Producer 和立即 Endpoint 使用独立的活动 command receipt：调用前写 `started`，返回后保存完整
Core event。Worker 中断后，已保存的 event 可继续交给 Core；只有 `started` 而没有 event 时，以
`EXECUTION_UNKNOWN` 失败，不再次调用。receipt 在 Result 完成和执行清理后删除，不进入历史。

### 5. Build 提交边界

SQLite 先创建独立、不可领取的待提交行；attachment 与 Result seed 准备成功后，Definition、Catalog、Execution
根和暂存行删除在一个事务中提交。同步错误会按 Result draft、Build 工作目录、暂存行的顺序清理。文件 Result
先写临时同级目录再 rename；历史列表忽略未完成临时目录。S3 创建失败只删除本次 seed 的精确 key。
待提交 Store 与立即 command receipt 是本地 Runtime 的必需边界，不存在能绕开的降级路径；
`prepare` 会在写入前拒绝任何同名 Runtime 状态，`discard` 也不会接管或删除原有 Build。

持久 Runtime 的 Build 请求必须同时提供项目 Result 地址与 Author Catalog；无 Result Build 不再是低层 API
可以打开的另一种生命周期。

硬进程退出留下的待提交行是显式的本地活动残留。操作人使用
`hypit result discard <build-id>` 精确删除其 Result draft、工作目录与待提交行；系统不做后台
扫描、历史推断或自动恢复。

### 6. 项目 Result、双图规划与历史文件

Result 选择已从 Runtime Profile 移到项目根 `hypit.results.json`；缺省是 `.hypit/results`。待提交与活跃执行
内部保存准确仓库位置供 Result writer 使用；CLI 与 Studio 的历史查询只打开当前项目自己的 Repository。
源码和 Run 路径以项目相对路径写入 Result。没有 Runtime Profile 时，项目 Result 仍能打开。

Author Graph 与 Run Graph 保持为两份完整编译输入。Planner 不再用 Run Satisfaction 覆写 Author Output 的默认
Candidate；它同时读取两张图，递归选择每个可达 Output 的 Candidate，并计算复杂 Candidate 重新引用 Author
Output 后的稳定执行闭包。被替换的默认路径会消失，被替代 Candidate 自己使用的上游仍然保留。

Planner 产出选中的初始 Record、step、`Output → Record` binding、goal 与 Target。持久化 Definition 和 BuildState
不再保存 Graph、BuildRequest、Satisfaction 或 Candidate id；Candidate 只存在于编译与 Studio 的源码解释阶段。
Run 与 Author 的内部 Fragment identity 使用不同命名空间，重复 Candidate/Operation 声明一律报错，不再比较内容后
合并。所选零输入值会经过与 Author Record 相同的 Type-owner 接纳边界。

Result 转发来源由 Planner 的最终选择一次性导出，按 Logical Output 交给 Result writer。CLI 不再重扫 `.svrun`
生成 Candidate 映射，writer 也不再根据 Candidate id 猜测来源。只有历史 Output 直接满足当前完整 Output 时才写
`build-output`；历史值若只是复杂 Candidate 的一项输入，当前产物照常由当前 Result 保存。

`build-output` 只能作为一个公开 Output 的完整值，不能嵌入 Composite。多级转发因此只是有限的
`Build/Output → Build/Output` 链；新转发在创建时要求来源 Output 已经存在，读取时遇到损坏循环会直接失败。

Result 的语义值只有 Scalar、Composite、Resource 三类；文件和 JSON 只是仓库编码。Scalar 直接写在 manifest，
顶层 Resource 指向 Result 自己的文件，Composite 写成一个 Value Document：`value` 保留普通领域数据，嵌套
Resource 的 `path → file` 绑定单独放在并列的 `resources` 中。领域对象即使恰好含有 `kind: build-file` 或
`kind: build-output` 也仍是普通数据，不会被读取器误认成存储指令。文件系统和 S3 共用同一个 Record → Result
编码器；adapter 只负责按给定相对路径写文档或字节。

BlobRef 重新只表示一次执行内的 Resource，不再携带 Result 仓库地址；领域 Type schema 也不再接受旧的
`origin.build/path`。本地值、本地文件和历史 Output 统一先作为结构化零输入 Candidate 参与规划，只读取最终闭包
真正选中的来源。选中的历史文件通过普通 attachment
在 Build 生效前暂存一次；直接转发且不被 Operation 消费的文件不会暂存或复制。一个编译会按准确的
`Build + Result path` 复用同一 attachment 身份，不比较文件内容。相同 Record 被多个公开 Output 指向时，
结构值文件也只写一份。

### KIE 清理

KIE 不再按 `@hypit/gpt-image` 模块名走硬编码分支。KIE 特有的不支持值属于该 route mapping 数据，
Endpoint 注册只读取 route 的 `supports`。Operation handle 删除了无用 contract/polls 字段，上传路径去掉
旧 `svml` 名称；Runtime 凭据诊断也不再识别某个 Provider 的环境变量名。

### 容量语义收敛

Endpoint 的 Pool 与 Lane 资源现在各自只声明一个 `limit`。Scheduler 用它限制当前调用，SQLite 用同一个
值限制跨 Build 仍占用该资源的异步 Operation；立即调用返回即释放，异步调用保留到 Operation 结束。
未发布过的旧双容量字段及其 SQLite 迁移已经删除；当前代码只读写单一 `limit`。

Build 身份不是容量资源，也没有 Build 级并发配置。真实外部排队只有 Provider 总池及其模型 Lane；其他
受限的本地执行也必须由对应包声明真实资源，不能拿 Build 数量代替。Worker 可同时推进互不冲突的 Build，
每轮只临时物化状态并把接受的事实写回 SQLite，不长期持有一份内存 Build 权威。

### 活动字节不再冒充历史入口

Runtime Host 与 CLI 已移除按 Resource id 读取活动字节的公开入口，以及旧的 `materializeRecord` 历史导出。
历史文件只能通过项目 Result 的 `build + output` 地址及 `get` 读取；Resource id 继续只在一次执行内部标识
临时字节。

### Result 自有展示与远端读取

已有 outcome 的 Result 可以直接保存人类标题、备注和重点 Output；`hypit result edit` 只改这一个
manifest，不打开 Runtime，不建立中心表。Studio 以 Result 列表补齐已结束 Build，即使不选择 Runtime 也能
显示历史；重点 Output 会优先展示。

Host 公开面已收敛为稳定 `BuildView`，只含 `activity / outcome / issue / targets / operations` 等产品事实。
CLI JSON 与 Studio 不再读取或输出原始 Submission、Execution、lease、资源库地址和内部 command id。
公开命令相应改为 `activity`、`result finish`、`result discard`；`retired / finalization / admission / archive`
不再作为产品状态或操作语言。

公开 Output 已收敛为 `publishedOutputs`：一个 Logical Output 只能有一个公开名，Target 仍只表达真正终点；
途中所有公开端口仍会随 Result 保存。物理文件和值只用 `file-0001`、`value-0001` 这类内部序号，公开名只存在
manifest 中，不再耦合路径、平台大小写或文件系统字符规则。

文件与 S3 Repository 都支持半开区间的字节读取，Studio 的 HTTP 媒体接口正确返回 `Range`、`206` 与
`Content-Range`，并把存储流直接送给客户端，不再把整个视频聚合进 Node 内存。Result Repository 提供从新到旧
的 cursor 浏览；文件实现先枚举浅层 UTC 日期桶，再只读取填满当前页所需日期中的 Build 目录，S3 用可逆倒序
时间 prefix 直接读取有界对象页；两者都不建立中央索引；
主动 doctor 只做一次有上限的 prefix 列表。项目 Result doctor 与 Runtime doctor 在 CLI 输出中合并，但
Result 选择仍属于 `hypit.results.json`，没有塞回 Runtime Profile。

### CLI 只组合公开能力

通用 CLI 不再自行选择文件系统 Result Repository；Distribution 必须显式提供项目 Result 的打开与诊断能力。
`builds / history / inspect / get / result edit` 只打开项目 Repository，`status` 在没有 Runtime 时也能读取结束
Result；`result discard` 只打开精确的 Result control，不再为了删除一份未提交完成的草稿顺带打开执行状态。

命令实现按职责拆成参数解析、项目 Result、活动执行、外部环境、Build 观察、公开视图与终端渲染。JSON 输出是
显式、版本化且有上限的视图联合，不再接受任意 Runtime/Repository 对象。`history --limit` 以匹配到的 Output
数量为准沿 Repository cursor 继续扫描，Source 过滤统一按项目相对路径解释；它不建立索引。`inspect` 与
`history` 只读取 manifest 级 Output 描述来判断 Scalar、Composite 或 Resource，不为列表展示打开 Composite
正文或媒体字节。

通用 CLI 不再含 HypiHub 名称、OAuth 地址或 client id。需要交互登录的 Endpoint 在自己的凭据描述中声明通用
OAuth PKCE 获取参数，CLI 只执行该声明；普通密钥与 JSON 凭据仍走所选 Credential Store。这里的 PKCE S256
只属于 OAuth 协议认证，不参与内容身份、Result 寻址或复用。

### Runtime Host 由 Distribution 组装

通用 CLI 只要求 Distribution 提供 `openRuntimeHost`；官方视频 Distribution 在唯一组装入口明确选择 Local
Runtime。原 Profile 中的 `runtime.use` 并不参与这次选择，只能再次写死 `@hypit/runtime-local`，现已连同
`runtime.config` 空包装删除。Local Profile 直接使用 `hypit.runtime-local@1`，只声明 `dataRoot`、Credential
Store 和 Endpoint。没有第二种真实 Host 前不建立 Host adapter、注册表或动态加载器；将来另一种应用可以在自己的
Distribution 边界提供不同实现，不需要改 Core 或通用 CLI。

### Reference Video 工具回到内容工具

`reference-video-tools` 已删除 route/revision/variant 状态机、恢复游标、内容摘要证据目录和聚合批准流程。
检查命令现在各自直接读取 Source、Run、已准备的参考内容或当前渲染并返回报告；一个报告不会解锁另一个
命令，也不会推进隐藏的项目状态。重复比较是一次新的明确观察，不按文件摘要静默复用旧判断。

布局检查每次测量当前实现，不再计算项目或输入摘要，也不缓存一份与摘要绑定的测量结论。需要人工接受的
具体发现以可读的结构位置命名。生产 skill 和公开文档也已同步删除旧恢复与变体路线，避免 Agent 重新建立
第二套执行历史。

### 测试只保留归属事实

删除了只保护上述旧状态机、批准流程和未发布 SQLite 形态的 14 个默认测试，以及不会进入默认套件、会真实
付费的 KIE live 脚本。`result finish` 的 CLI 测试只验证它没有构造执行 Provider，且只完成已决定的 Result
写入。KIE 的提交歧义、已接受任务继续轮询、下载与失败仍由无付费的伪服务测试。

旧八阶段执行测试已经替换为少量直接事实：待提交状态只能 commit/discard；Execution turn 可回收；decision
不可重新领取；attention 与 decision 正交；结束后原子删除整个 SQLite 活跃聚合。

未发布的旧 Result 布局、随机 Build id 与 `hypit_dispatches` 不再列作迁移任务：新实现不读取、不猜测，也不为它们
保留启动检查或兼容分支。项目 Result doctor 已经可以脱离 Runtime Profile 独立运行。将来只有出现一份真实、明确且
值得保留的数据时，才针对那一例另写显式工具；本项目现在不预建通用迁移框架，也不把“本地搬到 S3”当作 Core 能力。

## 仍待处理

- Studio 仍只把 Output 中的文件叶子做成 Artifact 卡片。inline/JSON、Semantic Take 与其内部文件关系需要
  完整的按需浏览视图；打开一个 Result 时再解析该 Result，而不是启动时解析全部历史。
- 损坏的多级 Output 转发会明确报错，但当前 `Promise.all` 会让一个损坏 Output 使整个 Studio Library 失败。
  应把错误限制在那个 Output/Result 上，不能增加后台修复、自动回退或重建。
- 是否提供一个内置的纯本地 Runtime Profile 仍是产品决定。目前 Result Store 已有文件系统默认值，但
  Endpoint、Program 和 Service 不会因为机器缺少 S3 或 Lambda 就偷偷改选另一条技术路线。

以上剩余项不得用哈希、中央元数据表、Build 重跑或自动历史恢复来“解决”。
