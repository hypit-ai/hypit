---
title: Script
description: Script Surface——Segment、Role Cue、Dual Text、Selection、Moment 与文本投影。
---

# Script

`<script>` 元素承载旁白或讲者说出的每一个字。Script 以**散文为先**：它不包含时间码、不引用媒体、不设定样式、不携带生成参数。管线中的其他组件都会读取 Script；Script 本身不读取任何内容。

```svml
<import from="@hypit/script@1"/>

<script id="story">
  <opening>
    <HOST> Hello world.
  </opening>
</script>
```

引入 `@hypit/script@1` 会激活 Script Surface。`id` 属性让其他组件可以引用该 Script 及其各部分。

## Segment

Segment 是按顺序排列的语音内容块。标签名**即**其 id——在同一个 Script 内必须唯一。

```svml
<script id="story">
  <opening>
    Hello world.
  </opening>

  <pause/>

  <middle>
    This is the second part.
  </middle>

  <close>
    Goodbye.
  </close>
</script>
```

- Segment 可以是自闭合标签（`<pause/>`）。空的 Segment 拥有结构但没有语音词元；它并不意味着静音或任何默认时长。
- Segment 不能嵌套——每个 Segment 都是 `<script>` 的顶层子元素。
- Segment 名称遵循 XML 命名规则：字母、数字、连字符、下划线。

其他组件通过 `{story.segment.opening}` 引用单个 Segment，通过 `{story.segment.opening.dialogue}` 或 `{story.segment.opening.speech}` 引用其文本投影。

## Role Cue

Role Cue 标识 Segment 内部**谁说了什么**。它们不是讲者实体，不选择语音，也不创建角色。

```svml
<dialogue>
  <ALICE> What time is it?
  <BOB> It's 8:30.
</dialogue>
```

- Role Cue **没有关闭标签**。一段话从当前 Role Cue 开始，延续到下一个 Role Cue 或 Segment 结尾为止。
- 一个 Segment 必须全部使用或全部不使用 Role Cue——混用会导致错误。
- 标签长度为 1–32 个字符。

Role Cue 会产生不同的文本投影：

| 投影 | 上例的输出 |
|---|---|
| **dialogue** | `ALICE: What time is it?`<br>`BOB: It's 8:30.` |
| **speech** | `What time is it?`<br>`It's 8:30.` |
| **caption** | `What time is it?`<br>`It's 8:30.` |

dialogue `Text` 包含 Role Cue 前缀，speech `Text` 和 caption 投影会去除前缀。给 `seedance:ReferenceVideo` 提供输入的 Prompt Program 可以使用 `{story.segment.dialogue.dialogue}`（带标签）。Script 还会显式输出 `{story.caption}` 作为有序的显示 Atom/Word 全集，并以 `{story.caption.correspondence}` 单独提供 Atom 到口播 token 的对应；只有定时汇合处需要后者。

## Dual Text

当屏幕上显示的文字与实际说出的文字不同时：

```svml
<explanation>
  <HOST> We call it <SVML | semantic video markup language>.
</explanation>
```

左侧进入 **caption** 投影；右侧进入 **dialogue** 和 **speech** 投影。

| 投影 | 输出 |
|---|---|
| **caption** | `We call it SVML.` |
| **speech** | `We call it semantic video markup language.` |

左侧为空是合法的：

```svml
<HOST> I was < | um> saying that this works.
```

这意味着 "um" 会被说出但永远不会显示为字幕。两侧可以有不同的单词数量——这是一种 N:M 文本映射，而非 1:1 替换。

## Selection

Selection 是内联声明的具名时间**范围**：

```svml
<script id="story">
  @whole
  <opening>
    <HOST> @problem Current tools make agents operate a timeline. @/problem
  </opening>

  <answer>
    <HOST> @solution SVML removes that editing loop. @/solution
  </answer>
  @/whole~
</script>
```

### 语法

| 标记 | 含义 |
|---|---|
| `@id` | 打开，右吸附（从下一个单词开始） |
| `~@id` | 打开，左吸附（从前一个单词的末尾开始） |
| `@/id` | 关闭，左吸附（在前一个单词的末尾结束） |
| `@/id~` | 关闭，右吸附（在下一个单词的起始处结束） |

`~` 后缀/前缀控制边界是吸附到左边还是右边。默认的打开标记为右吸附；默认的关闭标记为左吸附。

### 非连续 Selection

同一个 id 可以多次出现，以创建带有间隔的 Selection：

```svml
<demo>
  <HOST> @beat First point. @/beat Then something else. @beat Third point. @/beat
</demo>
```

`{story.selection.beat}` 现在覆盖两个不相邻的范围。

### 交叉 Selection

Selection 不要求像 XML 标签那样嵌套，它们可以互相交叉：

```svml
<demo>
  <HOST> @a One @b two @/a three @/b.
</demo>
```

Selection 标记是零宽度的，不会出现在任何文本投影中。它们编译为包含 `Range[]` 的 `SelectionSet` 值。Script 本身不包含秒数或帧号——时间信息来自 WhisperX 对齐。

其他组件通过 `{story.selection.problem}` 引用 Selection，将视觉内容绑定到叙事中的语义时刻。

## Moment

Moment 是具名的时间**点**（不是范围）：

```svml
<ecosystem>
  <HOST> @ranking! Image generation, video generation, captions and B-roll
         all become reusable components.
</ecosystem>
```

| 标记 | 含义 |
|---|---|
| `@id!` | 右吸附（时间点位于下一个单词的起始处） |
| `~@id!` | 左吸附（时间点位于前一个单词的末尾） |

Moment 编译为包含 `Point[]` 的 `MomentSet` 值。Selection 和 Moment 共享同一命名空间——同一个 id 不能同时用于两者。

其他组件通过 `{story.moment.ranking}` 引用 Moment。

## 注释与转义

```svml
<!-- This is a comment. Comments never enter any projection. -->

<demo>
  <HOST> Follow us \@svml on social media.
</demo>
```

保留语法起始符必须转义：

| 转义 | 产生 |
|---|---|
| `\@` | 字面量 `@` |
| `\<` | 字面量 `<` |
| `\\` | 字面量 `\` |

在 Dual Text 内部，还需转义 `\|` 和 `\>`。

## 综合示例

一个使用所有语法构造的完整 Script：

```svml
<script id="story">
  @whole
  <hook>
    <HOST> @problem Girls, you need to hear this. Never let anyone take credit
           for your work. @/problem
  </hook>

  <meeting>
    <HOST> @solution I started sending <BCC | B C C> recaps after every
           meeting: timestamps, decisions, who said what. @ranking! After
           the first recap, everything changed. @/solution
  </meeting>

  <evidence>
    <HOST> That gave me @emphasis the courage I was missing @/emphasis.
  </evidence>

  <payoff>
    <HOST> And guess what? I'm sitting in my old boss's chair now.
  </payoff>
  @/whole~
</script>
```

此 Script 声明了：

- 四个 Segment：`hook`、`meeting`、`evidence`、`payoff`
- 一个 Role Cue：`HOST`（在所有 Segment 中保持一致）
- 一个 Dual Text：`<BCC | B C C>`（显示为 "BCC"，说出为 "B C C"）
- 三个 Selection：`whole`（整个 Script）、`problem`、`solution`、`emphasis`
- 一个 Moment：`ranking`（标记 "After the first recap" 这一瞬间）

下游组件通过名称引用这些内容：`{story.segment.hook.dialogue}` 用于生成，`{story.selection.problem}` 用于 B-roll 时间绑定，`{story.moment.ranking}` 用于视觉卡片揭示。
