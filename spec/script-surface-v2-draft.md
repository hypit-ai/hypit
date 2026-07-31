# SVML Script Surface v2 delta

> **Draft; not frozen.**
>
> 本文只定义相对已冻结 [Script Surface v1](./script-surface-v1.md) 的增量。
> 未在本文改写的正文语法、三种文本投影、Selection、Moment、Slot、CST 和
> source-map 规则全部继承 v1。实现不得把本文的独立 Segment 端点静默标成 v1。

## 1. 唯一语法变化：无

v2 不增加新的正文符号。作者继续使用同样的 `<segment>`、Role Cue、Dual Text、
`@selection` / `@/selection`、`@moment!` / `~@moment!` 和 Slot。升级发生在
Semantic Anchor Index，而不是稿子颜值或标记密度。

## 2. Segment 拥有独立端点

v1 让相邻 Segment 共享一个结构切点。v2 改为每个 Segment 独立拥有稳定的
`start` 与 `end` identity。若 Script 有 `N` 个 Segment，第 `k` 个 Segment
有 `mₖ` 个 speech token，且 `M = Σmₖ`，Semantic Anchor Index 恰有：

```text
Σ(2mₖ + 2) = 2M + 2N
```

个稳定身份。每个 Segment 的局部顺序是：

```text
segment[k].start
token[k,1].start
token[k,1].end
...
token[k,mₖ].start
token[k,mₖ].end
segment[k].end
```

Program 起点和终点属于 ProgramBasis，不额外进入这个 Index。不同 identity
可以落到同一个 ProgramPoint，但不得合并身份。空 Segment 仍有独立 start/end，
即使二者最终重合。

## 3. Complete Semantic Map

v2 Locator 必须提交覆盖全部 `2M + 2N` identity 的总映射：

```text
SemanticAnchorIdentity → ProgramPoint(basisDigest)
```

完整性与精度正交：每个点都必须存在，同时可以标记为 `estimated`、`derived`
或 `measured`。消费者不得补点、移动点或从邻近 occurrence 借点。

每个 Segment 内必须非降序：

```text
segment.start ≤ token₁.start ≤ token₁.end ≤ ... ≤ segment.end
```

按源码相邻的 Segment `A`、`B` 还必须保持：

```text
A.start ≤ B.start
A.end   ≤ B.end
```

这允许硬切、重叠和留白，同时禁止一个可替换 Locator 把后写的整个 Segment
无提示地排到前写 Segment 之前：

```text
hard cut   A.end == B.start
overlap    B.start <  A.end
gap        B.start >  A.end
```

若未来需要真正重排或并行 speech，应发布显式的非线性叙事模型；v2 不让一个
普通 `Range` 在不同 Locator 下静默反向或消失。

## 4. Selection 与 Moment

位于两个 Segment 之间的左吸候选是前一 Segment 的 `end`，右吸候选是后一
Segment 的 `start`；两者可以同点，也可以因 overlap/gap 落在不同点。

SelectionSet 仍支持闭合、交叉和非连通 occurrence。Moment 仍只选择已有
identity，不增加 Index 数量。所有 occurrence 在同一个 ProgramBasis 上完成
一次量化；投影后为零长或反向的 occurrence 必须产生明确诊断，不能静默消失。

## 5. 冻结门槛

v2 只有在以下合同都有 golden fixtures 后才能冻结：

1. `2M + 2N` identity 的规范序列化与 digest；
2. 硬切、交叉转场、留白、空 Segment 和端点重合；
3. 相邻 Segment 的双单调约束与反向诊断；
4. 跨 Segment、交叉、非连通 Selection 及多 Moment；
5. Estimate 与 Exact Semantic Map 使用相同 identity、不同精度类型；
6. v1 → v2 的显式版本迁移，正文字符保持不变。
