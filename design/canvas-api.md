# Canvas 操作与终端接口

> Canvas 文档与事务契约在 `@hypit/canvas`，会话传输类型在 `@hypit/canvas-studio/protocol`。

## 调用入口

Canvas 操作以 Project 和明确的 `*.canvas.json` 路径寻址。ProjectHost 为这份文档提供一个共享的
Canvas Service。界面、CLI、Agent 和项目程序使用同一组类型化操作。Node 程序可直接打开 owner
lease。HTTP 和 CLI 沿用现有 ApplicationHost 的 Product Session 路径；一次终端操作租用一个
短会话，完成后释放。Canvas 的界面会话可继续订阅同一个 Service。详见 [Host 和打开期](canvas.md#host-和打开期)。

`create` 是显式的 Project 文件创建动作。由 Product Session 入口发起时，调用者提交明确的创建
请求，目标已存在就返回冲突。打开现有 Canvas 使用独立的打开输入。创建、编辑、报价和生成使用已选择
的 Project 范围；项目包目录、Media 和可用 Execution client 直接来自这个 ProjectHost。

## 操作范围

| 操作 | 输入与结果 |
| --- | --- |
| `create` | 项目内目标路径和名称。创建一份 Canvas 文档，返回地址和修订。 |
| `observe` | 按画布、节点、模型目录或节点历史读取有限投影。节点投影给出字段、端口、缺项和当前选择。历史仅读该节点附着的地址，以及从 Environment 读出的状态和可选输出。 |
| `transact` | 传入预期修订和一组类型化命令。校验后一次原子保存，返回新修订和命令涉及的节点。 |
| `quote` | 节点、Environment，可选预期修订与 Endpoint。解析当前输入并返回实际使用的修订、输入来源和 Execution 的报价。 |
| `invoke` | 节点、Environment、预期修订，可选 Endpoint 和 Invocation ID。提交一个请求，返回 Invocation 地址和接受状态。 |
| `adopt` | 某个已附着的具体 Publication 输出或资源及其目标 owner。Media 返回 `.media.json` 引用，Transcript 返回目标文档引用。 |

会话的 `subscribe` 提示现有投影失效；调用者可重新读取。预览用会话期限内的资源地址，媒体字节直接由
Project Media 或 Execution 提供。环境授权和诊断走 Application 的现有接口。等待、取消和读取
Publication 也沿用 Execution 接口。画布上的停止按钮通过该卡片的 Invocation 地址调用 Execution 取消。

HTTP 在 Canvas Session 路径下投影 `observe`、`command`、`quote`、`invocations`、
`invocations/cancel`、`adoptions`、`events` 和 `resources`。Product Session 的启动请求携带文档路径和明确的打开或
创建意图。这个路径同时服务一个短期 CLI 会话和持续订阅的界面会话。

## 编辑事务和结果选择

首个命令集覆盖下面的作者动作。

| 命令 | 修改范围 |
| --- | --- |
| `node.add`、`node.remove` | 增删一张卡片，以节点 ID 寻址。 |
| `node.rename`、`node.move`、`node.resize` | 修改一张卡片的名称、位置或尺寸。一次多选拖动用同一事务提交多条 `node.move`。 |
| `node.set-media` | 更换素材卡引用的 Project Media。 |
| `node.set-recipe` | 更换一个节点的模型和配方，保留其位置和已附着的历史。当前选择按新的输出端口校验，可在同一事务中清空不再匹配的选择。 |
| `input.set`、`input.clear` | 按节点 ID 和输入名修改一个输入。写入 literal、素材引用或上游节点及输出名；清空该输入就断开它的连线。 |
| `result.attach`、`result.detach`、`result.select`、`result.clear` | 修改一张卡的任务附着或结果选择。选择精确到 `environment + invocation + output + resource`，结构化输出使用它的具名输出。 |

单条命令和批量编辑使用同一个 `transact`。例如移动卡片和接首帧线可以分别提交，也可以合成一次修改。

```json
{
  "expectedRevision": "revision-from-observe",
  "commands": [
    { "kind": "node.move", "node": "motion", "x": 460, "y": 100 },
    {
      "kind": "input.set",
      "node": "motion",
      "input": "firstFrame",
      "binding": { "from": { "node": "still", "output": "image" }, "personReference": false }
    }
  ]
}
```

首期参考列表以单个输入为修改范围，提交该端口的新列表。Model 的端口描述校验各项是否匹配。
缺少必要输入的草稿可以保存，准备请求时给出节点和端口级诊断。

撤卡事务同时移除其布局、附着引用和相关连线。其已接受的 Invocation 仍按 Environment 的生命周期
保存。后续的撤消和重做只恢复文档内容，已执行的任务和已采用的 Media 由各自 owner 管理。
在画布添加已采用的 Media 使用普通加卡事务，可以附带同一次放置需要的连线。

修订对调用者是不透明的版本标识。首期用保存文档的内容生成修订，使短命令进程和重新打开的
Canvas 也能使用上一次观察到的 `expectedRevision`。写入由打开的 Canvas Service 串行化。
落盘失败时保留原修订；检测到文件已被外部修改时，重新打开或读取后再提交。

## 报价、提交和恢复

报价和提交调用同一个节点准备函数，按当前 Canvas 修订冻结 literal、连线指向的产物选择和 Media
引用，由 Model 形成一个有效请求和具名资源。上游缺少选中的产物时返回具体缺项。报价使用资源元数据；
计费输入不全时由 Execution 返回费率和缺项。提交时选定的输入与之后的画布编辑各有自己的生命周期。

一次生成在调度前写入可找回的身份。`ExecutionClient.start` 接受可选的 Invocation ID，
Execution 在选定 Environment 内校验并保证同一 ID 只接受一次。普通调用仍可由
Environment 分配 ID。Canvas 按以下顺序提交。

1. 按预期修订准备单节点请求，并为选定 Environment 分配唯一的 Invocation 地址。
2. 在写入保护内复查 Canvas 修订，把地址附着到节点并原子保存。附着失败时返回错误，由调用者决定是否重试。
3. 用该地址调用 `ExecutionClient.start`。返回值包含已保存的修订、地址和接受证据。明确的拒绝与
   尚未确认的提交分开报告。

重开或重试同一个 ID 时，使用现有 `get(address)` 查询同一次调用。已附着到同一节点的地址在检查
编辑修订前走查询分支，首次附着导致的修订变化不会让重试变成新提交。已有 Execution 记录的地址
不能再次入队。外部已有任务走明确的附着操作，校验其 Capability 和当前项目的访问范围。
暂查不到调用时，画布显示这个地址尚未确认。要再生成一次，由调用者显式发起新 Invocation。
结果完成后更新历史投影，选为后续输入需要显式选择。

采用动作使用明确的 Publication 地址和资源选择。采用成功后的 Media 引用可直接交给 NLE，
也可以在 Canvas 另加一张素材卡。若后续 Canvas 编辑冲突，Media 引用已经有效，调用者可拿回并重做放置。

## CLI 投影

下列命令由 `hypit` 可执行文件提供。终端与界面走同一个 Host，并用相同的命令、
诊断和返回值。默认显示简短结果，`--json` 显示完整的结构化回执。

```sh
hypit canvas create generation/opening.canvas.json --name Opening
hypit canvas open generation/opening.canvas.json
hypit canvas inspect generation/opening.canvas.json --json
hypit canvas catalog generation/opening.canvas.json --json
hypit canvas node generation/opening.canvas.json still --json
hypit canvas apply generation/opening.canvas.json --input edit.json
hypit canvas history generation/opening.canvas.json still --json
hypit canvas quote generation/opening.canvas.json motion --environment hypihub --json
hypit canvas invoke generation/opening.canvas.json motion --environment hypihub --if-revision "$revision"
hypit execution wait "$invocation" --environment hypihub
hypit canvas adopt generation/opening.canvas.json motion --input publication-selection.json
```

`apply` 接受 `{ expectedRevision, commands }`，拖拽、连线和选结果使用同一语义。历史回执提供
可选的输出和资源名，`adopt` 输入使用其中一个确切地址。界面打开入口沿用 ApplicationHost 的
Product Session 启动方式。

报价回执给出 `revision`，可传给 `invoke --if-revision`。提交回执给出 `address`，其
`environment` 与 `invocation` 可传给现有 Execution 命令。脚本需要自行关联请求时，可以在
`invoke` 时显式提供 `--invocation-id`。

`canvas adopt` 的输入是 `{ selection, target }`。Media 的 `target` 为 `{ "kind": "media" }`，
可选 `path` 指定新 `.media.json` 文件。转写的目标为 `{ "kind": "transcript", "path": "transcripts/line.json" }`。
`selection` 使用 `address`、`output`，媒体资源额外指定 `resource`。
