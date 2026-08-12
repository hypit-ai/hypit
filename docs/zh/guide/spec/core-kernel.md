---
title: Narratage Core Kernel
description: 当前可执行合同：持久化 Graph、BuildRequest、Plan 与 BuildState 的 wire 格式。
---

# Narratage Core Kernel

状态：当前可执行合同。持久化的 Graph、BuildRequest、Plan 与 BuildState wire 格式都是 `@1`。

Core 是与领域无关的图 Demand 编译器，以及一台经过校验的 Build 状态机。它不解析源码、不加载包、
不执行实现、不选择 Endpoint、不访问凭据、不持久化 Artifact，也不认识任何视频词汇。

## 输入

Core 只接受不可变的、已经完成链接的数据：

- 一份已解析的 module closure 与带类型的作者 Record；
- 一份完整的 `svml.graph@1`，其中包含来自 Author Graph 与 Run Graph 的 Logical Output、彼此独立的
  Candidate 和原子 Operation；
- 一份包含 Target 的 `svml.build-request@1`。

图的构造、源码解析、包解析、Fragment 展开和 Run Graph 的编写都发生在 Core 之外。Core 在推导 plan
之前先校验这些数据。

## 图中的值

1. 一个 `LogicalOutput` 是稳定的、作者可见的承诺：身份、名义 Type 和 Primary Candidate。
2. 一个 `Candidate` 是一份独立的带类型供给。它的根要么是一个不可变的 Provided Value，要么是一个原子
   Operation 的结果。它不隶属于任何 output。
3. Run 编译器逐条应用显式的 `Satisfaction`：在不可变的 realized graph 中，把对应 Candidate 设为该
   output 的 Primary Candidate。Core 不接受第二个选择来源。
4. 一个 `Target` 指名本次 Build 所需要的一个 output。
5. 一个 `Operation` 具有稳定的实例身份、已声明的带类型输入，以及恰好一个原子结果。多结果组件先产出
   一个 Product，再接确定性的 Projection Operation。

## 编译法则

1. Core 从所有 Target 出发，沿被选中的 Candidate 和 Operation 输入反向推导 Demand。
2. 选择结果已经冻结在图中；只有可达性决定要做哪些工作。
3. 被多条边引用的同一个 Operation 实例只纳入一次。不同实例之间绝不做内容去重，即使实现、参数或输入
   Record 完全一致。
4. Provided-Value Candidate 没有输入边，遍历自然终止。Core 没有 Pin、预览、缓存或历史结果分支。
5. 一个 Candidate 必须产出使用它的那个 Logical Output 所要求的、完全一致的名义 Type。
6. 环、悬空引用、未声明端口、重复身份和不兼容 Type 都在执行之前失败。
7. 产出的 `svml.plan@1` 是有限的、确定的，并按内容绑定到已校验的 Graph 和 BuildRequest。

## 执行法则

1. Core 从冻结的 BuildPlan 发出 Command。Driver 与 Runtime 无法改变 Candidate 选择、依赖拓扑或 Target
   的含义。
2. Record、Need、Command、Event、Receipt 和 Derivation 都是不可变的、按内容绑定的事实。
3. 一份 Derivation 绑定实现身份、输入与输出摘要、Need 请求摘要，以及被接受的 Event 摘要。
4. 一份外部 Receipt 绑定确切的 Need、请求摘要、履约实现、输出摘要和被接受的 Event。
5. 序列化的未完成 Command 不可信。Resume 会校验已接受的状态，丢弃旧 Command，并确定性地重新生成下一批
   Command。
6. 只有当每一个 Target Record 都存在时，Build 才算完成。

## 类型法则

1. Type 由 module 按名义持有，不在某个中心化的 Core union 里注册。
2. Core 对每一条被准入的 Record 校验锁定的结构 Schema。
3. Type 的持有者可以锁定一个语义 validator 摘要。一旦存在，该 Type 的每一条 Record 都需要一份 receipt，
   绑定到确切的 Type、值摘要和 validator 实现。
4. Graph 持有依赖关系，Derivation 持有确定性血缘，Receipt 持有外部履约来源。

## 边界

`@narratage/protocol` 持有 wire 数据与身份。`@narratage/core` 持有校验、Demand 编译和状态转移。编译器
包持有源码与图的构造。Runtime 持有调度、持久化与放置。Endpoint 包履约确切的 Capability。领域包持有共享
词汇与 validator。

文件后缀、包名和 TypeScript class 都不授予 Kernel 特权。在 Core 之后发布的领域包，可以只通过 manifest、
名义 Type 和普通 Operation 参与进来，不需要重新发布 Core。

Kernel 没有特权终端输出，没有 Film 根节点，没有视频流水线方向，也没有单 Target 限制。
