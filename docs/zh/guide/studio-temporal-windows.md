---
title: Studio 时间谱系
description: Studio 如何沿真实执行图呈现选择、投影与消费，而不反向猜测。
---

# Studio 时间谱系

> 状态：Temporal Point/Window 的只读谱系已经接通。只有存在唯一源码逆像的编辑才允许写回；
> 跨层自动反推仍被禁止。这不新增 Core 协议。

时间线 item 并不只是一个起止帧矩形。大多数 Track 先选择 Program、Selection、Segment 或
Moment，再把它投影进帧空间，最后由领域组件消费。Studio 保留这三个层级：

```text
作者选择层（Program / Selection / Segment / Moment）
  -> 投影层（TemporalPoint / TemporalWindow）
  -> 消费层（Item 生命周期、Sequence、Ranking Schedule、Track）
```

## 选择层

选择层保留来源种类与规范身份。Moment 是语义点，Selection/Segment 是语义区间；坐标相同
不表示身份相同。SVML 的 `during`、`at`、`until` 等属性只负责声明作者选择，不直接变成
领域组件中的找帧逻辑。

Selection 保存作者明确写下的一对有方向 Anchor，不在 Script 层排序、交换或 clamp。端点方向与
最终投影是否合法是两件事：Temporal Projection 对表达式计算后的 raw window 负责，拒绝反向或
零宽窗口；与 ProgramSpace 相交后不足一帧也拒绝。这样只消费一个边界的 Point 仍可保留原始作者
身份，而持续内容不会收到非法 Window。

## 投影层

Surface lowering 生成 `TemporalPointSpec` 或 `TemporalWindowSpec`，再连接正式 Temporal
Producer。投影结果保留来源身份、作者表达式与解析后的帧坐标：

- `TemporalPoint` 表示一个合法帧边界，范围是 `[0, frameCount]`；`program.end` 可以精确落在
  `frameCount`。
- `TemporalWindow` 表示一个非空半开区间 `[startFrame, endFrameExclusive)`。

激活点和末端点必须是 Point，不能再用 `+1f` 或 `-1f` 伪造成 Window。普通 Media、Audio、
Typography 等持续内容仍消费 Window。

## 消费层

领域组件只接收已经投影好的 Point/Window 和确实需要的 ProgramSpace。它可以继续拥有真正
的领域算法，例如 Media Sequence handoff、Ranking 非重叠 reveal、素材 occupancy、动画阶段
和音频 sample mapping；但它不再接收 Selection/Moment 后偷偷定位帧。

消费区间不保证等于投影区间。Deck Card 的可见区间由 activation Point、下一张卡和 terminal
Point 共同决定；Ranking 的 preferred Window 还会被 schedule 变成 active/settled 阶段。
这些关系必须读领域 Programme/Schedule，Studio 不重新实现。

## Studio 如何取得谱系

Studio 对本次 Run 选中的每条 Track 做只读索引：

1. 从该 Track 的实际 BuildPlan selection 出发遍历执行依赖闭包；
2. 找出闭包中真实执行得到的 `TemporalPoint` / `TemporalWindow` 记录；
3. 保留投影 Spec、来源、表达式和精确坐标；
4. 保留直接消费该记录的 Producer、输入端口和同一消费节点的输入值；
5. 由 package-owned adapter 把领域实体连到这条真实消费边。

因此 Studio 不再通过以下信息猜谱系：

- `during/at/selection/moment` 等属性名字；
- `MediaItemSpec` 等硬编码 Spec 类型名；
- 运行时 id 前缀或 renderer id；
- 两个对象恰好相同的帧区间。

Point 和 Window 在 ABI 与 Inspector 中保持不同：Point 显示 `At`，Window 显示 `From/To`。
链路缺失时保持 unresolved，不用近似规则补齐。

## 写回边界

修改语义来源、修改绝对投影端点、修改消费参数仍是不同的作者目标，但 UI 只公开
`timeline.adjust` 与 `parameter.adjust` 两种顶层操作。`timeline.adjust` 根据实体真实记录的 lineage
选择唯一目标：

- 来源是 Selection：move/trim 修改 Script 中该 Selection 的 Anchor markers，全部消费者一起更新；
- 来源是 Moment：move 修改该 Moment marker，显式 `for` 仍可单独 trim-end；
- 来源是绝对 `start/end`：修改精确的 Window 端点；
- Segment、Program、Schedule 派生阶段或链路缺失：保持只读。

这是沿公开身份做逆变换，不是按矩形帧数反推。不能隐式猜测。
