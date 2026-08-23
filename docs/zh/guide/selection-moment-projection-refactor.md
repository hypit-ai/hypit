---
title: Selection、Moment 与 Projection 重构状态
description: 单语义来源与组件入口前投影的当前实现、目标边界和未决问题。
---

# Selection、Moment 与 Projection 重构状态

> 状态：Selection/Moment 单值化、Point/Window 投影运行图和 Studio 只读谱系追踪已经完成；跨层回写仍保持显式、保守。

## 已完成

- 一个 `NarrativeSelection` 只保存一对具名 Anchor：`startAnchorId` 与 `endAnchorId`。
- 一个 `NarrativeMoment` 只保存一个具名 Anchor：`anchorId`。
- Script 中同名 Selection 或 Moment 只能声明一次；同一个名字也不能同时属于两种类型。
- 旧的 occurrence 数组、展开策略、`occurrences=` 作者接口和兼容分支已经删除。
- Media、Audio、Typography、Comment、Overlay 与 Ranking 已迁移到单 Selection / 单 Moment 输入。
- Ranking TierBoard/TopThree 的每个非预置 item 各自引用 Moment；Column 的每个非预置 item
  各自引用 Selection。

## 当前运行图

SVML 仍然显式写出 `during`、`at/for`、`start/end` 及其 Selection、Segment、Moment 来源，
Surface lowering 会按语义生成 `TemporalPointSpec` 或 `TemporalWindowSpec`。运行图随后执行
对应的 Temporal Projection Producer，领域组件入口只收到已经解析好的 `TemporalPoint` 或
`TemporalWindow`：

```text
SemanticTrack + Program/Selection/Segment/Moment + Temporal Point/Window Spec
```

```text
SVML 时间语法糖
  -> TemporalPointSpec / TemporalWindowSpec（作者投影表达式）
  -> Temporal Point / Window Projection Producer
  -> TemporalPoint（来源、表达式、边界帧）
     或 TemporalWindow（来源、表达式、半开帧区间）
  -> 领域组件入口
  -> 组件内部消费逻辑
```

Media、Audio、Typography、Comment、Overlay、Ranking、Deck 的领域 ItemSpec 不再保存
`projection`；唯一的投影表达式位于 Temporal Spec，唯一的解析坐标位于 Temporal Point/Window。
领域组件只接收已经投影完毕的窗口或点，继续拥有真正的领域消费逻辑，例如 Ranking
的避让与非重叠 schedule、Media Sequence 的 handoff、Audio 的 trim/loop/stretch、动画的
enter/body/exit。组件不再负责把 Selection、Segment 或 Moment 解释成帧。

## 反向 Selection：未禁止

Selection 当前保存的是作者明确写下的一对有方向 Anchor；暂不规定第一端必须在第二端之前。
原因是语义来源端点的方向与最终投影窗口是否合法不是同一个问题。例如原始端点可能反向，
但作者的 `start` / `end` 表达式和 offset 仍可能投影出一个正向、非空的最终窗口。

因此目前采用以下边界：

- Script 保留作者写下的端点和 affinity，不排序、不交换、不 clamp。
- Temporal Projection 对最终 raw window 负责：反向、零宽、完全越界或量化后不足一帧时失败。
- 只消费一个边界的 ProjectedPoint 仍可合法使用该边界。
- 是否需要额外禁止“没有任何可观察语义宽度”的 Selection，待真实作者需求与 Studio 回写
  设计一起决定，不能仅因默认恒等投影会失败就在 Script 层提前禁止。

## 后续工作

1. Studio 已从本次 Run 的执行闭包读取真实 Temporal 记录、投影 Spec 和直接消费边；不得退回
   属性名、Spec 类型名、运行时 id 前缀或相同 span 推断。
2. Timeline 修改必须明确选择语义来源、投影表达式或消费参数中的一层。当前只对有唯一源码
   逆像的绝对端点和 duration 开放写回；Selection/Moment 引用不会从下游矩形自动反推。
3. 继续清理仍教授非连通 Selection、MomentSet/SelectionSet 或旧 Ranking triggers 的文档。
