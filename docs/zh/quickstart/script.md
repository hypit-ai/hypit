---
title: Script
description: Script Surface——Segment、Role Cue、Dual Text、Selection、Moment 与文本投影。
---

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
- Segment 名称符合 `[a-z][a-z0-9_-]{0,63}`；`script` 是保留名称。

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

dialogue `Text` 包含 Role Cue 前缀，speech `Text` 和 CaptionDocument 会去除前缀。给
`seedance:ReferenceVideo` 提供输入的 Prompt Program 可以使用 `{story.segment.dialogue.dialogue}`
（带标签）。Script 输出一份 `{story.caption}` CaptionDocument，里面有显示词、N:M 对齐单元
和作者 Cue；里面没有秒数或帧数。

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

这意味着 "um" 会被说出但永远不会显示为字幕。两侧可以有不同的单词数量——这是一种 N:M
对齐单元，而非 1:1 替换；即使语义标记定位到口播内部的一个词，显示单元仍然保持完整。

两侧都明确书写时，标记只能出现在 Dual Text 的 spoken side。display side 是字面文本，未转义的 `@` 会报错；
如果确实要显示 at-sign，请写成 `\@`。

两边文案相同时，可以省略竖线后面的口播：

```svml
<explanation><HOST>把<动效|><组件化|>。|| 以后就能<直接复用|>。</explanation>
```

`<组件化|>` 等价于 `<组件化|组件化>`：字幕是一个完整单元，口播中的三个字仍各自保留时间。
字幕样式可以让这组文字一起高亮；普通文本仍然可以直接书写，不必逐词包裹。`||` 继续决定
Cue 的切换。这同样适用于其他语言的短语或名字，例如 `<Git Hub|>`。

这时左侧同时提供口播，因此标记也可以放在左侧，Studio 会回写到实际文字上：
`<组@{beat!}件化|>`。标记和显示属性不会成为口播内容。若明确写了右侧口播，标记仍然属于
右侧。明确或共享的口播都必须包含可说出的词；`<API|...>` 只有标点，无法建立时间对应，因此无效。

`||` 是 **Caption Cue 分隔符**，它在一个完整对齐单元之后结束当前 Cue，不能写进 Dual Text 或切开
N:M 单元。字幕稍后通过独立 NarrativeCaptionBinding 与 NarrativeProjection 得到绝对帧时间。

### 空格与拼写

按想显示的内容书写：`是的 就是这样`、`3개월`、`3 개월`、`3D` 和 `3 D` 会保留各自的
分隔。连续普通空白规范为一个空格；说话轮次首尾的排版空白和 Dual Text 两侧的边缘空白
不显示。源码换行不是字幕换行；用 `||` 分 Cue，用所选字幕样式控制视觉换行。

语义标记不贡献文字或空格。`是的@{part}就是这样@{/part}` 连续显示；
`是的 @{part}就是这样@{/part}` 保留空格。`<文字|>` 用来明确字幕分组，
不是保护拼写或空格所必需的写法。

### 扁平词属性

显示词可以带一个扁平的属性块。属性写在词后面，不嵌套，也不表达时间：

```svml
<line><HOST>This is really{emphasis,keyword} important{brand}.</line>
```

不写 `=` 的属性值默认为 `true`，也可以写成 `name=value`。Caption 家族决定这些显示词属性
如何影响表现。带时间范围的 Use 选择字幕 Style；属性不会切开、包裹或改变 Dual
对齐单元的时间。

### CaptionDocument 的组成

`CaptionDocument` 是 Caption 拥有、Script 可由同一源码生成的显示值，包含三种明确的内容对象：

- **Display Word（显示词）**：一个用于渲染的词面，包含应该显示的标点；
- **Alignment Unit（对齐单元）**：最小的显示-口播对应关系，Dual Text 的 N:M 映射也保持为一个单元；
- **Cue**：由完整对齐单元组成的有序组。Segment 和 Role 边界会结束 Cue；`||` 可以在同一轮话语内显式结束当前 Cue。

标点不是口播 token，也不会获得独立时间窗。Dual Text 后面的句号会吸附到前一个显示词：
`<test | now>. here` 显示为 `test. here`，口播投影仍是 `now. here`。英文按词拆分；汉字、
平假名和片假名按字符级 lexical unit 拆分，因此中文不会被当成一个巨大的词。

## Selection

Selection 是内联声明的具名语义**范围**。每个名字只能有一对打开/关闭标记；它的值是两个
语义锚点，而不是帧区间：

```svml
<script id="story">
  @{whole}
  <opening>
    <HOST> @{problem} Current tools make agents operate a timeline. @{/problem}
  </opening>

  <answer>
    <HOST> @{solution} SVML removes that editing loop. @{/solution}
  </answer>
  @{/whole~}
</script>
```

### 语法

所有标记都以 `@{` 开始、以 `}` 结束；`/`、`!`、`~` 均在内部。名称以小写字母开头，
后续可用小写字母、数字、`_`、`-`，总长不超过 64；内部不允许空白或嵌套。
`@{beat!}` 是 Moment，`@{part}!` 则是区间首后跟正文感叹号。标记不能切开语音 Token，也不能插到它与附着标点之间：应写 `@{beat!}“测试”`，不能写 `“@{beat!}测试”`。


| 标记 | 含义 |
|---|---|
| `@{id}` | 打开，右吸附（从下一个单词开始） |
| `@{~id}` | 打开，左吸附（从前一个单词的末尾开始） |
| `@{/id}` | 关闭，左吸附（在前一个单词的末尾结束） |
| `@{/id~}` | 关闭，右吸附（在下一个单词的起始处结束） |

`~` 后缀/前缀控制边界是吸附到左边还是右边。默认的打开标记为右吸附；默认的关闭标记为左吸附。

完整 Script 严格拥有 `2M + 2N` 个有序语义锚点：每个 Token 两个、每个 Segment 两个，
不会额外生成外层或 Program 首尾锚点。在第一个 Segment 之前，两种 affinity 都落到该
Segment 的 start；在最后一个 Segment 之后，两种 affinity 都落到该 Segment 的 end。
在 Segment 内部或两个 Segment 之间，affinity 仍按标记位置选择相邻的 Token 或 Segment 边界。

### 多个具名 Selection

不同名字可以重叠或交叉，但每个名字仍然只有一个区间：

Selection 不要求像 XML 标签那样嵌套，它们可以互相交叉：

```svml
<demo>
  <HOST> @{a}One @{b}two@{/a} three.@{/b}
</demo>
```

Selection 标记是零宽度的，不会出现在任何文本投影中。它们编译为带有
`startAnchorId`/`endAnchorId` 的 `NarrativeSelection`。Script 本身不包含秒数或帧号——时间
信息来自 Timeline 对齐。

Narrative Projection 声明通过 `{story.selection.problem}` 引用 Selection，并发布具名绝对
Window；组件消费这个 Window，不需要认识 Script 身份。

## Moment

Moment 是具名的时间**点**（不是范围）：

```svml
<ecosystem>
  <HOST> @{ranking!} Image generation, video generation, captions and B-roll
         all become reusable components.
</ecosystem>
```

| 标记 | 含义 |
|---|---|
| `@{id!}` | 右吸附（时间点位于下一个单词的起始处） |
| `@{~id!}` | 左吸附（时间点位于前一个单词的末尾） |

每个 Moment 名字只出现一次，编译为带有 `anchorId` 的 `NarrativeMoment`。Selection 和 Moment
共享同一命名空间——同一个 id 不能同时用于两者。

Narrative Projection 声明通过 `{story.moment.ranking}` 引用 Moment，并发布具名绝对 Instant；
组件消费这个 Instant，不需要认识 Script 身份。

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
| `\|` | 字面量 `|`（两个竖线写成 `\|\|`） |

普通文本中的单个 `|` 本身就是字面量；未转义的 `||` 才是 Caption Cue 分隔符。
在 Dual Text 内部，第一个未转义的 `|` 分隔 display 和 spoken 两侧；display 侧的竖线必须
写成 `\|`，需要字面量右尖括号时写成 `\>`。

## 综合示例

一个使用所有语法构造的完整 Script：

```svml
<script id="story">
  @{whole}
  <hook>
    <HOST> @{problem} Girls, you need to hear this. Never let anyone take credit
           for your work. @{/problem}
  </hook>

  <meeting>
    <HOST> @{solution} I started sending <BCC | B C C> recaps after every
           meeting: timestamps, decisions, who said what. @{ranking!} After
           the first recap, everything changed. @{/solution}
  </meeting>

  <evidence>
    <HOST> That gave me @{emphasis}the courage I was missing.@{/emphasis}
  </evidence>

  <payoff>
    <HOST> And guess what? I'm sitting in my old boss's chair now.
  </payoff>
  @{/whole~}
</script>
```

此 Script 声明了：

- 四个 Segment：`hook`、`meeting`、`evidence`、`payoff`
- 一个 Role Cue：`HOST`（在所有 Segment 中保持一致）
- 一个 Dual Text：`<BCC | B C C>`（显示为 "BCC"，说出为 "B C C"）
- 三个 Selection：`whole`（整个 Script）、`problem`、`solution`、`emphasis`
- 一个 Moment：`ranking`（标记 "After the first recap" 这一瞬间）

下游图节点通过名称引用这些内容：`{story.segment.hook.dialogue}` 提供生成文本；Narrative
Projection 声明显影 `{story.selection.problem}` 供 B-roll 计时，并显影
`{story.moment.ranking}` 供视觉卡片事件使用。
