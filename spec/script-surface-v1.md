# SVML Script Surface v1

> **Draft; not frozen.**
>
> SVML 尚未公开发布，不存在需要兼容的旧语言版本。本文直接定义首个公开目标
> Script Surface v1；仓库中的早期原型不是规范合同。实现只有在通过本文的
> parser、projection、source-map 和 temporal golden fixtures 后，才可声称
> 支持 SVML v1。

SVML 是语义视频源语言，不是像素渲染格式。本文只定义它最高频、最需要保持
可读性的稿子区 `<script>`；画布、节点、样式、生成参数和其他 Program 区域的
外层文档结构另行设计。v1 发布后，新增语义应首先组合本文已有构造；确需改变
正文语法时再发布新版本，不能因为早期原型行为而削弱当前 v1。

## 一页合同

正文除自然语言外只有六种语义构造：

| 构造 | 只负责 | 不负责 |
|---|---|---|
| `Segment` | 有序的媒体/口播块和独立结构端点 | 自动 Selection、时长、静音 |
| `Role Cue` | `dialogue` 导出时的“谁说了什么”文本前缀 | speaker 实体、音色、字段路由 |
| `Dual Text` | 显示文字与实际读音不同 | TTS 厂商参数、样式、动作 |
| `Selection` | 一个或多个显式闭合的语义时间区间 | 消费者声明、绝对秒数 |
| `Moment` | 一个或多个显式完整的语义时刻 | 半截区间、持续时间 |
| `Slot` | 注入运行时文字值 | 注入 SVML 语法或任意 AST |

注释是 trivia，不是第七种语义构造。任何字幕样式、B-roll、Ranking、Deck、
音效、静音、生成提示、节点端口和消费策略都在 `<script>` 外引用
Selection 或 Moment。消费者不归属于某个 Segment；一个消费者可有多个
端口，每个端口可接一个或多个 Selection/Moment。Selection 可以跨 Segment
或由非连通区间组成，Moment 也可以有多个 occurrence。

Script 编译必须先生成保留源码映射的 Narrative IR，再从同一份 IR 投影三种
文本。禁止先生成三个互不相关的字符串，再猜它们之间的对应关系。

| 投影 | 内容 | 典型消费者 |
|---|---|---|
| `dialogue` | Role Cue + 实际读音 | Seedance 等对话/视频生成 |
| `speech` | 仅实际读音 | Estimate、TTS、Speech Reference、对齐 |
| `caption` | 仅显示文字 | 字幕与文本展示 |

## 正例

```svml
<script>
  @whole

  <segment id="hook">
    <A> I just @laugh @pop! <lmao | laughed my @punch ass out @/punch> @/laugh.
  </segment>

  @silence
  <segment id="pause"/>
  @/silence

  <segment id="close">
    <B> Meet <${product} | ${product_pronunciation}>.
  </segment>

  @/whole~
</script>
```

若 `product = "Hypit"`、`product_pronunciation = "high pit"`，三个文本投影
分别是：

```text
dialogue
A: I just laughed my ass out.
B: Meet high pit.

speech
I just laughed my ass out.
Meet high pit.

caption
I just lmao.
Meet Hypit.
```

`silence` 只是 Selection 的名字，不会自动让音频静音。它完整选择了空
Segment 的两个独立结构端点；真正的静音或素材行为由外部 Program 决定。
`pop` 是一个默认吸右的 Moment，解析到 `laughed` 的起音；它同样不进入
任何文本投影。

## 1. 文档与 Segment

一个 Script 有且仅有一个 `<script>` 根。v1 的 Segment 形式只有：

```svml
<segment id="intro">
  Hello.
</segment>

<segment id="pause"/>
```

规范规则：

- Script 包含一个或多个按源码顺序排列的 Segment。
- Segment id 在文档内唯一，Segment 不允许嵌套。
- 自然语言只能出现在 Segment 内；Segment 之间只允许空白、Selection/Moment
  标记和注释。
- 空 Segment 使用自闭合形式。它有结构开始/结束切点，但没有词法锚点。
- 空 Segment 不蕴含静音，也不蕴含任何默认时长。其物理时长来自媒体、生成
  结果或 `<script>` 外的 Program。
- Segment 不自动声明同名 Selection。选择一个、三个或任意多个 Segment，
  都必须显式写闭合 Selection。
- 每个 Segment 独立拥有 `start` 与 `end` 两个稳定 identity；相邻 Segment
  不共享结构端点 identity。两个 identity 可以在硬切时落到同一 ProgramPoint，
  也可以因 overlap 或 gap 落到不同点，但不能合并身份。

例如选择三个连续 Segment：

```svml
@chapter
<segment id="one">
  One.
</segment>
<segment id="pause"/>
<segment id="two">
  Two.
</segment>
@/chapter
```

## 2. Role Cue

Role Cue 只在 Segment 内的逻辑行首（忽略规范缩进）出现，并开启一个
spoken turn：

```svml
<segment id="dialogue">
  <A> What time
      is it?
  <B> It’s 8:30.
</segment>
```

它在 `dialogue` 投影中由规范 serializer 输出为：

```text
A: What time is it?
B: It’s 8:30.
```

在 `speech` 和 `caption` 投影中，`<A>`、`<B>` 都被移除。Role Cue 不是
speaker 数据模型，不建立人物实体，不选择音色，不成为可接线字段，也不对
字幕隐式分组。外部 Program 可以显式写 `role="A"` 查询这些 spoken turn；
Compiler 将结果降低为一个可非连通的派生 SelectionSet。仅有 `<A>` 本身不触发
任何样式、人物、音色或素材行为。

为消除歧义：

- Role Cue 只由“逻辑行首、合法尖括号内容、且不含未转义 `|`”这一位置识别，
  并且同一行必须跟随非空 spoken content。
- 正文里的冒号永远是正文；解析器不通过 `A:` 猜说话人。
- 同一个非空 Segment 要么完全无 Role Cue，要么第一个 spoken atom 必须由
  Role Cue 开启。时间标记、注释和布局空白不算 spoken atom；已经以无 Cue
  正文开始的 Segment 不得在中途切换为有 Cue 模式。
- 一个 Role Cue 的 turn 一直延续到下一个 Role Cue 或 Segment 结束。turn
  内的物理换行只是布局空白，不结束 turn，也不要求重复 Role Cue。
- Role Cue 不是容器标签，没有 close syntax；`</A>`、`</B>` 等形式必须作为
  未知尖括号构造失败，formatter 永不输出它们。
- Role label 是 NFC 后 1–32 个 Unicode 字符的可读文本；可由 Unicode
  Letter、Mark、Number、内部空格、`_`、`-`、`.` 组成，首尾不得有空白。
  引号、`=`、`/`、换行、`<`、`>`、`|`、`:` 均非法，因此带属性的未知
  结构标签不会被吞成 Role Cue。
- 在 `dialogue` 投影中，Role Cue 边界由规范 serializer 输出为一次换行和
  `label: ` 前缀；在 `speech` 与 `caption` 中只移除 Cue，并在相邻 atom
  之间保留必要分隔。重新折行源码不得改变 Narrative IR 的语义内容或任一
  文本投影；允许变化的只有 source range 和 source hash。

## 3. Dual Text

Dual Text 同时写出显示文字和实际读音：

```svml
<lmao | laughed my ass out>
```

左侧进入 `caption`，右侧进入 `dialogue` 和 `speech`。普通正文是
`<text | text>` 的简写，不需要任何标记。

Dual Text 是一个不可嵌套的原子对应单元，而不是简单的字符串替换：

- 两侧可以是任意 N:M 文本映射，不要求词数相等。
- 右侧去除布局空白后必须非空；只显示不发声的文字不属于 Script，应由外部
  Text/Deck/Caption Program 表达。
- 左侧可以为空，例如 `< | um>` 表示实际说出 filler，但字幕不显示。
- Slot 两侧都可使用；Selection/Moment 只可出现在 speech 侧，并且只能落在
  其词法 token 边界。
- 整个显示侧继承整个 speech 侧的时间跨度。若显示词需要独立计时、选择或
  样式，作者必须把它拆成多个 Dual Text 原子。
- 普通时间消费者可以选择一个 Dual Text speech 侧的部分 token；但字幕
  ownership/style 消费者若只覆盖一个 Dual Text 原子的部分 speech span，
  编译必须以 `partial dual atom` 失败，不能猜测如何切左侧显示文字。

例如合法的细粒度时间选择：

```svml
<lmao | laughed my @middle ass out @/middle>
```

`middle` 可以供 B-roll 或音效使用；若它被用作该 `lmao` 的局部字幕替换区，
则必须报错。作者可通过拆分原子提供明确映射。

Dual Text 只表达“实际说了什么”。IPA、SSML、重音、语速、语种、情绪、
音色和厂商专用发音字典不是第四种正文文本层，应由外部生成/语音 Program
引用 Selection 或词典资源表达。

## 4. Selection

Selection 是区间声明，不是供下游自行拼接的两个公开锚点：

```svml
@id ... @/id
~@id ... @/id~
```

每个开始标记都必须有同 id 的结束标记。编译器输出一个完整
`SelectionSet`，消费者只接收该集合中的闭合 range；不存在 start-only
对象、消费者默认补尾或“信息传了一半”的状态。

“闭合”指源码的两个端点都被明确声明。物理运行时使用半开
`[startFrame, endFrameExclusive)` Frame Span。

### 4.1 左右吸附

标记本身零宽，不进入任何文本投影。它位于左右两个可选语义边界之间：

| 端点写法 | 吸附方向 | 典型含义 |
|---|---|---|
| `@id` | 右 | 从右侧词首或右侧结构端点开始 |
| `~@id` | 左 | 向外扩到左侧词尾或左侧结构端点 |
| `@/id` | 左 | 在左侧词尾或左侧结构端点结束 |
| `@/id~` | 右 | 向外扩到右侧词首或右侧结构端点 |

例子：

```svml
before @x hello @/x after
```

`x` 默认从 `hello` 的词首到 `hello` 的词尾。

```svml
before ~@x hello @/x~ after
```

`x` 向两侧外扩，分别取 `~@x` 左侧和 `@/x~` 右侧最近的可选边界。

```svml
@pause
<segment id="empty"/>
@/pause
```

`pause` 的开始吸附空 Segment 的开始切点，结束吸附它的结束切点。Selection
可完全位于 Segment 外，也可跨任意数量的 Segment。

### 4.2 闭合、交叉与非连通

同一个 id 可以顺序出现多次，编译为一个非连通 SelectionSet：

```svml
@beat one @/beat ... @beat three @/beat
```

不同 id 可以自由交叉，不要求 XML 式嵌套：

```svml
@a one @b two @/a three @/b
```

规范要求解析器按 id 管理开放状态，而不是使用一条全局栈。以下情况必须
失败：

- 未闭合、孤立 close 或 open/close id 不一致；
- 同一个 id 尚未闭合就再次 open；
- Selection 标记切进一个 v1 speech token 内；
- 依赖消费者默认 span 来补齐缺失端点。

同一 id 的多个 occurrence 保持源码顺序和稳定 occurrence identity。不同
SelectionSet 以及同一集合的不同 occurrence 可以在物理时间上重叠。

### 4.3 可选时间边界

Slot 绑定、Dual Text speech 投影和 NFC 归一化之后，v1 使用规范定义的
确定性 `speech-tokenizer-v1`：

- 东亚表意文字和假名单字符成 token；
- 其他受支持文字/数字脚本形成最大连续 run；
- `'` 或 `’` 只在两个 run 字符之间时保留；
- 空白、标点、emoji 和其他分隔字符不产生词法 token。

因此标点本身不可被计时，Selection/Moment 也不可切入单个 token。v1
编译器在移除零宽标记后再 tokenization，所以未来若需要字素、音节或音素
边界，可以在新的 timing profile / Script Surface 版本中复用相同的
Selection/Moment 类型；v1 不应为尚不存在的精度引入新正文符号。

若 Script 有 `N` 个 Segment，第 `k` 个 Segment 有 `mₖ` 个 speech token，且
`M = Σmₖ`，Semantic Anchor Index 恰有：

```text
Σ(2mₖ + 2) = 2M + 2N
```

个稳定身份。每个 Segment 内的局部顺序是：

```text
segment[k].start
token[k,1].start
token[k,1].end
...
token[k,mₖ].start
token[k,mₖ].end
segment[k].end
```

Program 起点和终点属于 ProgramBasis，不额外进入 Semantic Anchor Index。空
Segment 仍有独立 start/end，即使二者最终重合；任意不同 identity 即使最终
落到同一帧也不能合并。

Locator 必须提交覆盖全部 `2M + 2N` identity 的总映射：

```text
SemanticAnchorIdentity → ProgramPoint(basisDigest)
```

完整性与精度正交：每个点都必须存在，同时可以标记为 `estimated`、`derived`
或 `measured`。消费者不得补点、移动点或从相邻 occurrence 借点。每个 Segment
内部必须非降序：

```text
segment.start ≤ token₁.start ≤ token₁.end ≤ ... ≤ segment.end
```

按源码相邻的 Segment `A`、`B` 还必须保持：

```text
A.start ≤ B.start
A.end   ≤ B.end
```

这允许硬切、重叠与留白，同时禁止一个 Locator 把后写的整个 Segment 静默排到
前写 Segment 之前：

```text
hard cut   A.end == B.start
overlap    B.start <  A.end
gap        B.start >  A.end
```

若未来需要真正重排或并行 speech，应发布显式的非线性叙事模型；v1 不让普通
Range 在不同 Locator 下反向或消失。

同一份 SelectionSet 在不同 fulfillment 产生的 `CompleteSemanticMap` 上可得到
预览或成片区间。Map 使用相同 identity；每个 anchor 以 `measured`、`derived` 或
`estimated` 记录证据质量。Script 本身不含秒数、帧号或采样点。
Script Surface 不绑定帧率、采样率或渲染器。后端一旦选择物理时钟，必须只
量化一次并让所有消费者复用同一整数边界；后端时钟变化不改变本语言表面。

对齐、结构端点、projection 或帧量化可能使某个 occurrence 最终成为零长或
反向区间。实现必须产生明确诊断，不能静默丢弃、移动 Selection 端点、借用
相邻 occurrence 或替作者补范围。

## 5. Moment

Moment 是完整的点声明，不是省略了 close 的 Selection：

```svml
@id!
~@id!
```

`!` 明确标出这个名字的类型是 Moment。它不需要也不允许 close：

| 写法 | 吸附方向 | 典型含义 |
|---|---|---|
| `@id!` | 右 | 右侧词首或右侧结构端点 |
| `~@id!` | 左 | 左侧词尾或左侧结构端点 |

默认右吸覆盖“与某个词一起开始”的高频情况：

```svml
I just @pop! laughed my ass out.
```

`pop` 解析到 `laughed` 的起音。显式左吸写成：

```svml
I laughed ~@pop! and left.
```

`pop` 解析到 `laughed` 的收音。位于两个 Segment 之间时，左候选是前一
Segment 的 `end`，右候选是后一 Segment 的 `start`；两者可以同点，也可以因
overlap 或 gap 落在不同点。

规范规则：

- 同 id 的 `@id!` / `~@id!` 可以重复，按源码顺序编译成一个
  `MomentSet`；一次 occurrence 是单 Moment，多次只是同一集合含多个点。
- Selection 与 Moment 共享 temporal name namespace。同一个 id 不能同时
  声明两种类型；`@x! ... @/x` 必须以类型冲突失败。
- 单独的 `@x` 永远是未闭合 Selection open，必须报错；解析器不得因为没有
  找到 `@/x` 而把它猜成 Moment。
- `@id!~` 是冗余且非法的右吸写法；右吸只写规范形式 `@id!`。
- 语法只接受 ASCII `!`。未转义 `@id！`（全角感叹号）是 malformed
  temporal syntax，不能退化为正文。
- Moment 与 Selection marker 可出现在相同位置，包括 Segment 之间和
  Dual Text 的 speech 侧，但均不得切入 v1 speech token。
- Moment 只选择 Semantic Anchor Index 中已有的一个候选点，不新增 anchor
  identity；因此 `2M + 2N` 的精确计数不因 Moment 数量改变。
- MomentSet 与 SelectionSet 复用同一份 CompleteSemanticMap 和一次性
  帧量化；区别只在最终载体是 `Point[]` 而不是 `Range[]`。

消费端保持两个互不相混的类型：

```text
SelectionSet = Range[]
MomentSet    = Point[]
```

推荐的显式使用关系是：

```svml
during="phrase"        <!-- 只接受 SelectionSet -->
at="pop"               <!-- 只接受 MomentSet -->
at="phrase.start"      <!-- SelectionSet 的各 range 起点投影 -->
at="phrase.end"        <!-- SelectionSet 的各 range 终点投影 -->
```

`at="phrase"` 不得默认猜成 start，`during="pop"` 也必须类型报错。一个
消费者若同时需要窗口和触发点，必须使用两个字段/端口，而不是构造
`Range | Point | mixed[]` 的多态 TemporalRef。端口需要 `one` 还是 `each`
属于消费者 cardinality 契约，不改变 Script 的单/多 occurrence 语法。

## 6. Slot

Slot 是解析器识别的一等 AST atom：

```svml
${product}
<${product} | ${product_pronunciation}>
```

Slot id 经 NFC 后必须由 1–64 个字符组成：首字符为 Unicode Letter 或 `_`，
其余字符可为 Unicode Letter、Mark、Decimal Number、`_` 或 `-`。绑定值是
单行 Unicode 纯文本，不能含 CR/LF 或控制字符。

关键安全规则：

- 先解析 Script，再绑定 Slot；禁止在解析前做字符串替换。
- 绑定值永远按 literal text 进入已经存在的 atom，不能注入 Segment、Role
  Cue、Dual Text、Selection、Moment、Slot、注释或转义序列。
- 未绑定 Slot 可以保留在结构化编辑 IR 中，但凡是生成三种文本、计算 token
  或编译时间线，都必须 fail closed。
- SVML v1 writer 只输出 `${变量}`；未转义的 `[变量]` 只是普通正文。

## 7. 词法保留、转义与规范排版

源码统一把 CRLF/CR 转成 LF，并做 Unicode NFC。源语言中未转义的 `<`、`@`
和 `${` 是保留语法起点。格式错误的保留语法必须报错，不能退化为 spoken
text。

正文转义：

```svml
\@openai
\<not-a-role>
\${literal}
\\
```

Dual Text 内另有：

```svml
\|
\>
```

未知反斜杠转义必须报错。解析优先级固定为：

1. 已知结构标签与注释；
2. Segment 内逻辑行首、不含未转义 `|` 的 `<Role>`;
3. 含一个未转义分隔 `|` 的 inline `<display | speech>`;
4. 其他尖括号结构报错。

Segment 与 temporal name 使用独立命名空间；Selection 和 Moment 共享
temporal name namespace。三者的 id 均满足：

```text
[a-z][a-z0-9_-]{0,63}
```

除“逻辑行首可识别 Role Cue”这一词法作用外，源码缩进、换行和连续空白都
是 authoring layout，不是 turn、字幕换行或停顿指令。编译投影在 atom
边界保留必要分隔并规范化布局空白；字幕 cue 切分与硬换行由外部 Caption
Program 决定。

结构标签和注释不依靠独占一行才被解析。规范 formatter 把结构标签和注释
各自放在独立行，使用两空格缩进 Segment、四空格缩进 Segment 内的 spoken
content，并在 Segment 之间留一空行。formatter 前后重新解析所得 Narrative
IR 的语义内容必须相同；允许变化的只有 source range 和 source hash。

注释使用 `<!-- ... -->`，可以跨行但不能嵌套，也不能写进 Dual Text、Slot、
temporal marker、Role Cue 或结构标签内部。注释可出现在 atom 之间允许布局
空白的位置，并按布局空白处理；规范 formatter 将其独占一行。注释不进入
任何投影、token、Selection、Moment 或 hash 的语义内容；需要可复现源码
身份时可以另算 source hash。

## 8. Narrative IR 与消费者合同

解析结果至少保留：

- Segment 的顺序、id 和独立 start/end identity；
- 每个 Segment 的有序 spoken turn，以及各 turn 的稳定 identity、可选 Role Cue、
  token range 和 source range；
- plain / Dual Text / Slot atom 及其源码范围；
- caption atom 到一个或多个 speech token 的显式映射；
- 每个 SelectionSet 的一个或多个有序 occurrence；
- 每个端点的左右 affinity 和端点源码位置。
- 每个 MomentSet 的一个或多个有序 point、左右 affinity 和源码位置。

外部 Program 的 `role="label"` selector 从上述 turn token ranges 派生一个
SelectionSet；同一 label 的多次 turn 成为同一集合的多个有序 occurrence。
它是显式查询，不是 Role Cue 的隐式字幕行为，也不建立 speaker entity。

SelectionSet/MomentSet 是消费者边界，不是 Segment 的子对象。典型外部
关系是：

```text
Script ──compile──> Narrative IR ──project──> dialogue / speech / caption
                           │
                           └──resolve──> SelectionSet[] / MomentSet[]

SelectionSet A ──during──> consumer.port_1
MomentSet P    ──at──────> consumer.port_2
SelectionSet C ──during──> consumer.item_3
```

一个 Ranking、B-roll 或其他节点可以有多个动态端口，各端口接受不同
SelectionSet/MomentSet；同一集合也可以被多个消费者复用。未来 Graph
语法可以把这些类型边写成 `during=` / `at=`，但它们必须引用已解析的名字
或端点投影，不能接受模糊自然语言 locator。

Caption 的多样式、region、cue segmentation、annotation、mute 和 layout
都属于 Caption Program。Caption consumer 若要求互斥 token ownership，重叠必须作为该消费者的
编译错误；这不是 Script 禁止 Selection 重叠。未来 Caption 若支持 overlay，
只扩展 Caption Program，不扩展正文语法。

## 9. v1 明确不在 Script 中表达

以下能力不是遗漏的第七种 inline marker：

| 需求 | v1 归属 |
|---|---|
| 绝对秒数、帧号、采样点、任意 sub-frame 位置 | Script 外的运行时/Program |
| token 内音素或字素级切点、标点专属时间 | 后续 timing profile 或新版本 |
| 空 Segment 的预览时长 | 媒体、生成器或显式 Program |
| 同时重叠说话 | 多轨媒体/生成 Program；Base Script 仍是顺序语义轴 |
| 笑声、咳嗽、环境声、SFX、beep | 音频/生成/SFX Program |
| 无 speech 时间依据的纯显示文字 | Text、Deck 或 Caption Program |
| 字幕样式、手工断行、动效、画面动作 | 相应 Program 引用 Selection |
| 语气、情绪、音色、重音、语速、SSML | Speech/Generation Program |
| Consumer、节点、端口、DAG 接线 | `<script>` 外的 SVML 区域 |

这些边界保证 Script 保持“可直接阅读的稿子”，同时不阻止完整 SVML 最终
确定性编译 DAG 和时间线。

## 10. 完备性与扩展判定

遇到新需求时按下列顺序归类：

1. 显示文字和实际读音不同：Dual Text。
2. 对话导出的朗读人前缀不同：Role Cue。
3. 语义时间范围不同：Selection。
4. 语义瞬间不同：Moment。
5. 顺序媒体/口播块不同：Segment。
6. 运行时文字输入不同：Slot。
7. 字幕、画面、音频、生成或消费行为不同：Script 外的 Program。

只要需求能落入这七项，就不得发明新的 inline delimiter。若七项都不能
无损表达，应先证明它属于稿子语义而不是 Program，再以新版本提案处理；
不得让现有解析器“顺便支持”。

## 11. 实现验收

一个实现只有同时满足以下证据，才能声明支持 Script Surface v1：

1. 本文全部正例、反例、投影和 source-map golden fixtures；
2. parser、formatter、Narrative IR 与三投影不依赖 provider 或渲染器；
3. SelectionSet 支持闭合、交叉、非连通 occurrence 与左右 affinity；
4. MomentSet 支持 `@id!` / `~@id!`、单/多 occurrence 与 `at` 类型闸；
5. Dual Text 在 speech、caption 与时间映射上保持一个可审计 source map；
6. Slot 采用 parse-first、literal-only binding，不能注入语法；
7. 未知版本、未知保留语法、混合 temporal type 与 partial dual atom 全部
   fail closed。
8. `2M + 2N` identity 的规范序列化、digest、完整 Map 与相邻 Segment 双单调
   约束都有 golden fixtures；硬切、overlap、gap、空 Segment 和端点重合均被
   覆盖。
