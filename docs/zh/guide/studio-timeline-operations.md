---
title: Studio 作者操作
description: Studio 如何用 timeline.adjust 与 parameter.adjust 修改 SVML、SVS，而不把计算结果伪装成作者事实。
---

# Studio 作者操作

Studio 服务的是批量 AIGC 广告制作：先把第一个范例的位置、样式和时间编排调明白，再把同一作者程序用于后续 1–100 条视频。它不是面向无作者意图素材的通用 NLE，也不提供 ripple、roll、razor、overwrite 等传统主时间线操作。

## 时间不是一个匿名矩形

一条可见时间线实体保留完整链路：

```text
选择层（Selection / Moment / Segment / Program）
  -> 投影层（TemporalWindow / TemporalPoint）
  -> 组件消费（Programme / Schedule）
  -> VisualTrack / AudioTrack
```

SVML 在组件入口前完成选择和投影。组件只消费已经解析的 Point/Window，并负责自己的领域排程；它不能重新读取 Selection 再偷偷找帧。Studio 也不根据属性名、运行时 id、renderer id 或相同帧区间反猜这条链，而是读取本次 Run 实际执行闭包中的投影记录和消费边。

## 只有两种作者操作

Studio 对作者源只公开两个顶层操作：

### `timeline.adjust`

修改时间线上已经存在实体的时间。`move`、`trim-start`、`trim-end` 和点移动只是它的手势载荷，不是更多种顶层操作。

一次手势按以下顺序解析：

1. 组件 Companion 为每个手势声明按时间来源选择的准确逆变换：Semantic 身份、源码参数名或明确禁用。
2. Studio 读取该实体实际记录的 temporal lineage。
3. 来源是 Selection 时，矩形拖动直接修改这一个共享 Selection 的 Script markers。
4. 来源是 Moment 时，整体移动修改这一个共享 Moment marker；若实体另有显式 duration，右端仍可单独修改 duration。
5. 来源是显式绝对 Window 时，移动或裁边修改其准确的 `start`、`end` 或 `for` 源码端点。
6. Segment、不可逆的 Program 派生阶段或缺少唯一逆变换的实体保持只读。

浏览器只提交实体身份、手势和目标锚点/窗口，不提交任意源码补丁。服务端根据当前 Snapshot 上的 handle 再次解析唯一写回目标。

### `parameter.adjust`

修改右侧参数面板中 Adapter 明确公开的一个作者参数。参数保持自己的原始语言和位置：

- SVML 字面量写回 SVML；
- 被引用的 Frame/Extent 字段写回它自己的 SVML 定义；
- SVS Recipe 属性写回对应 `.svs`；
- 引用关系本身保持只读，不会被替换成匿名字面量；
- SVRun Candidate 和 Provider 事实保持只读。

参数面板不按属性名扫描并猜能力。Adapter 提供 vocabulary，Markup 只提供精确 source range。

## Selection 拖动语义

Script 为 M 个 token 和 N 个 Segment 公开 `2M + 2N` 个有序 Anchor：每个 token 的首尾与每个 Segment 的首尾。Selection 拖动只能落到这些身份明确的 Anchor 上。

- 拖起点：只改变 Selection 的开始 marker；
- 拖终点：只改变结束 marker；
- 整体移动：两个端点按相同的 Anchor 序号增量移动；
- 所有引用这个 Selection 的 Text、Media、Audio、Ranking 等实体在重新编译后一起变化；
- 不修改词的声学时间，不把 Selection 偷换成绝对帧，也不复制出一个“只属于当前矩形”的 Selection。

这正是共享绑定的价值。下游矩形不是伪装成 Selection；它通过自己的真实 lineage 成为修改该 Selection 的一个入口。

Moment 同样按 Anchor 身份移动，但它始终是一个点。Segment 边界不开放普通拖动，因为那意味着在结构化 Segment 间搬运正文，没有唯一的轻量手势语义。

## 组件内部子项

组件若希望内部 item 可编辑，必须把它的时间输入外化并让 Adapter 为附属 lane 声明手势。

Column 是标准例子：组件表面显式接收一个 outer Window 和 N 个 item-owned Window。N 个 Window 必须位于 outer 内且两两不交；组件原样消费它们，不 clamp、不避让、不重新排布。Studio 中每个 reveal 矩形因此能沿自己的真实 Window -> Selection 链修改对应 Selection。若拖动产生重叠或越界，Ranking 拒绝新输入，整次 Studio 操作不提交。

Tier/TopThree/Deck 的 activation 则来自 item-owned Moment；它们能移动 Moment，但 schedule 的 active/settled/cumulative 等派生阶段仍然只读。

## 操作执行

每次作者操作都使用当前 Snapshot revision：

```text
gesture / inspector change
  -> StudioMutation（timeline.adjust 或 parameter.adjust）
  -> 当前实体 handle 解析唯一作者目标
  -> 生成最小 Source 修改
  -> 使用现有 Run 重新编译和预览
  -> 成功：发布新 Snapshot
  -> 失败：恢复原 Source，返回本次领域错误
```

这里没有长期文件锁、额外 lock.json、内容哈希或隐藏 Build。Studio 重编译不会调用 Provider、创建 Candidate 或启动外部生成；它只验证现有满意 Run 能否消费修改后的作者源。revision 不一致时操作直接拒绝，要求从新 Snapshot 重新规划。

时间线拖动时浏览器只做本地几何预览，`pointermove` 不写 Source；松手后只提交一次。参数控件只在 `change` 时提交，不在每个键入事件上重编译。服务端同一时间只接受一个作者事务，因此当前不需要额外 debounce、队列、后台恢复或高频写入协议。

## 当前明确不做

- 不把任意本地素材拖入语义轨；没有预先作者意图的素材导入不属于当前产品。
- 不做通用 split、delete、duplicate、ripple、roll、slide、insert、overwrite。
- 不拖动 WhisperX 等 Candidate 给出的 token 声学边界。
- 不从 renderer geometry 反推作者 Frame；画布拖动需另有明确的空间参数逆变换。
- 不修改组件公开 Schedule 的派生阶段来猜它原来的 Selection/Moment。
- 不在 Studio 中产生外部 Need；能打开 Studio 的特殊 Candidate 必须已经完全 satisfied。

## 责任边界

组件包负责声明输入契约和领域不变量；Studio Adapter 负责声明某类实体可接受的轻量手势与参数全集；Studio 中心层负责统一指针手感、Anchor 吸附、操作解析、revision、编译验收和失败恢复；Script/各作者包负责把公共身份精确变回自己的源码表示。

核心原则只有一句：修改作者关系，而不是修改一个看起来碰巧相同的结果矩形。
