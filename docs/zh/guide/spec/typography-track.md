---
title: Typography Track 创作与表达力
description: 官方二维 Text 包的已实现预发布权威文档。
---

# Typography Track 创作与表达力

状态：官方二维 Text 包的已实现预发布权威文档。完整声明的模型与浏览器证据都通过冻结的仓库内部
Track/Visual IR 窄腰执行；作者 Surface 本身尚不是已发布的 ABI。

## 1. Conclusion

完整的 Text 模型不是一个更大的 `TextAppearance` 对象。它是下列各维度的正交乘积：

```text
authored document
× temporal binding
× spatial form
× text flow
× exact typography
× ordered Paint layers
× deterministic local motion
```

一个普通的透明标题、整句话外面套一个背景、每一行渲染行各套一个背景、孤立的词 Pill、连成一体的荧光笔
几何，以及逐字素簇的打字机效果，都是这个模型中的不同取值。它们不是不同的渲染器组件，也不需要在 Core、
Film 或 Composition 里开分支。

“完整”不等于把有史以来所有特效都塞进一个扁平对象。它的意思是：

1. 每一种常见的二维编辑器 Text 行为，在这个模型里都有带类型的落点；
2. 新增 Style 和 Recipe 不会改动共享协议；
3. 输入或物理规律确实不同的能力，使用显式的兄弟组件；
4. 任何超出终端元素语言表达范围的自包含视觉效果，都可以物化为带类型的 compositable Surface，而无需改动
   Core。

官方 Text 包拥有这套作者语义。SVS 只提供具名的不可变 Recipe 参数。Visual IR 仍是共享的终端视频语言。
HyperFrames 只是这门语言的一个渲染器，而不是 Text 的定义。

## 2. Audit evidence

### 2.1 Current Narratage slice

当前 `packages/typography-track` 的实现只有一个固定矩形框、一个纯字符串，以及一个包含颜色、字号、字族、
字重、行高、水平/垂直对齐、单一背景、圆角、内边距和字距的 `TextAppearance`。它的 Surface 恰好只接受
`text`、`during` 和 `appearance`；它的 Recipe 恰好要求十一个标量属性。

它目前无法表达：

- 段落、显式换行或样式不同的内联 run；
- 作者 Surface 上的精确字体 Artifact 输入；
- point text、固有尺寸或路径文字；
- 相互独立的 frame/content/paragraph/line/run/word/grapheme Paint 目标；
- 渐变、可重复的描边、可重复的阴影、辉光或下划线 Layer；
- 具备 Unicode 意识的词/字素簇行为、双向 run 或竖排文字策略；
- item、行、词或字素簇级别的动画；
- 文字遮罩或物化的高级文字效果。

这只是一个有用的端到端见证。一个字段一个字段地扩展 `TextAppearance`，只会把错误的模型固化下来。

### 2.2 Legacy evidence

遗留的 `TextLayoutV2` 发现了几组正确的分离：

- 内联/块级 `hug | fixed` 尺寸；
- 相互独立的内边距与内联/块级对齐；
- 不换行、按词换行和按字符换行；
- visible、clip、ellipsis 和 shrink 四种溢出处理；
- LTR/RTL 与横排/竖排；
- frame/content/line/word 背景目标；
- line box、cap height 和 ink bound 三种度量。

它的渲染器还实现了纯色/渐变字形填充、外描边、阴影、辉光、气泡尾巴、整个 item 的入场/循环运动、打字机
显现以及行/词背景。这些都是有价值的行为见证。

这份实现同样暴露了它为什么不能被照搬成新合同：

- 一个 `TextFields` 参数袋把内容、布局、Paint、运动和装饰混在一起；
- 渐变填充与背景都在抢 CSS 的 `background` 属性；
- 词背景按空白字符正则切分，因此根本没有定义 Unicode 的词行为；
- 打字机切的是 JavaScript code unit，而不是字素簇；
- 外描边是靠复制字形实现的隐式渲染器把戏；
- 行片段、缩放适配以及 cap/ink 裁切依赖浏览器行为，而这些行为并未体现在被声明的值里；
- 一个指针会悄悄创建出背景，而且好几个默认值是渲染器自己发明的；
- 完全没有富 run、路径文字或可重复 Paint Layer 的模型。

一份经过审计的历史导出包含 32 个 Text Track 和 53 个 Text item。使用频率最高的属性是对齐、字族/字号、
颜色、字重、背景、圆角和内边距。描边、大写、不换行、全宽背景、字距和阴影也有使用。该样本中没有任何
Text 动画使用记录。这证明了常规交付的基线；但它不足以成为排除下文那些成熟编辑器能力的理由。

### 2.3 External editor attack matrix

本设计是对照官方产品文档核对的，而不是从 UI 标签反推的：

| 能力族 | 成熟产品的例子 | Narratage 中要求的表达 |
|---|---|---|
| advanced typography | 字距、字偶距、行距、基线偏移、制表位、大写、上/下标、下划线与 Tsume | 带类型的 typography 与逐 run 覆盖 |
| layered appearance | 纯色/渐变填充、内/中/外描边与可重复描边、可重复阴影、辉光 | 有序、可重复的 Paint Layer |
| geometric text boxes | point 标题、area 段落、响应式对齐、滚动字幕/横向滚动 | 分离的 Point 与 Area 形态，外加运动 |
| fragment styling | 字符/词/行级样式与动画 | 确定性单元与选择器 |
| sequential animation | 逐字符延迟、range/follower 选择器、方向、扩散与循环 | 选择器加属性动画栈 |
| path text | 文字沿开放/闭合路径排布并动画 | 显式的 Path Text 形态 |
| text masks | 用文字显现显式自有的媒体或图形 | 带显式媒体输入的兄弟组件 |
| real 3D text | 挤出、倒角、材质、灯光与逐字符 3D | 物化的 3D 组件，而不是伪造的 2D 字段 |

参考文档：

- Adobe Premiere：[Text Styles](https://helpx.adobe.com/uk/premiere/desktop/add-text-images/stylize-text/create-text-styles.html)
  与 [Text Style Parameters](https://helpx.adobe.com/ca/premiere/desktop/add-text-images/stylize-text/style-parameters-when-applying-from-style-browser.html)
- Adobe After Effects：[Animating Text](https://helpx.adobe.com/uk/after-effects/desktop/animating-text/text-animation/animating-text.html)
- Apple Final Cut Pro：[Adjust Titles](https://support.apple.com/en-qa/guide/final-cut-pro/ver4e32ca5/mac)
- Apple Motion：[Sequence Text Behavior](https://support.apple.com/en-lamr/guide/motion/motn1607c46e/mac)
- Blackmagic Design：[DaVinci Resolve 20 Visual Effects Guide](https://documents.blackmagicdesign.com/UserManuals/DaVinci-Resolve-20-Fusion-Visual-Effects.pdf?_v=1757574011000)

这是一组表达力攻击集，而不是要求复刻每个产品的 UI 或预设列表。

## 3. Ownership and package boundary

常规二维能力仍然只用一个包：

```text
@narratage/typography-track
  Point Text
  Area Text
  Path Text
  Text Style / Inline Style declarations
  Text Program validation
  temporal/spatial resolution adapters
  VisualTrack lowering
```

Point、Area 和 Path 之所以是三个独立的作者组件，是因为它们断言的几何不同。它们不是那种会让端口忽隐忽现
的 `mode` 字段。它们仍然可以下降到同一个带标签的 `TextItemProgram` 联合类型，并作为对等 item 共存于同一个
Text Track 中。

有两项能力的输入实质不同，因此留在常规 Text 之外：

- Text Mask 组件必须显式消费文字形状和它所遮罩的媒体/图形；它不得去采样恰好位于其下方的那个 Track；
- 真正的 3D Text 拥有挤出、材质、灯光和相机语义，通常物化为带 alpha 的 Surface。

在后续的官方发行版中，它们可以是独立的包，也可以是需要单独导入的组件。包的数量是发行决策；但它们的图
合同必须保持分离。两种情况都不会给 Core 增加分支。

官方的本地 Text Mask 见证刻意只接受一个精确的单行 Area Text 形状和一个显式的静态 `CompositableSurface`。
富 run、多行/Path 排布、序列动画和定时素材都会 fail closed，并走与 3D Text 相同的“物化 Surface”逃生路线。
这条边界避免了假装浏览器 `foreignObject` 遮罩是可移植且精确的。

## 4. Authored Text Document

Text item 消费的是一份有界的富文档，而不是 HTML 片段或任意树：

```ts
type TextDocument = {
  readonly paragraphs: readonly TextParagraph[];
};

type TextParagraph = {
  readonly id: string;
  readonly runs: readonly TextInline[];
  readonly style?: TextParagraphStyleRef;
};

type TextInline =
  | { readonly kind: "text"; readonly text: string; readonly style?: TextInlineStyleRef;
      readonly language?: string; readonly direction?: "auto" | "ltr" | "rtl" }
  | { readonly kind: "break" };
```

具体的公开名称在实现过程中可能改变，但下列法则不会变：

1. 文字、空白、标点和显式换行完全保持作者顺序；
2. 一个纯字符串是“一个段落、一个 run”的简写；
3. Span 只改变可显式继承的 typography/Paint，绝不改变时序或 item 摆放；
4. 只有当被选用的布局/Paint/运动操作确实需要单元时，源文字才会被切分；
5. 切分具备 Unicode 与 locale 意识，并绑定到具体实现；
6. 任何 Text 包都不得用 LLM 去改写、拆分或装饰作者内容；
7. `uppercase`、小型大写字母及类似变换属于表现层，绝不改变被声明的文档值。

确定性的单元层级是：

```text
document > paragraph > explicit run > rendered line > Unicode word > grapheme cluster
```

`rendered line` 只有在确定了精确字体和最终几何之后才存在。字素簇是常规情况下作者可见的最小动画/装饰单元。
一个 shaped glyph 未必与某个 Unicode 字符或字素簇一一对应，因此公开的作者模型不得假装它们一一对应。

## 5. Three spatial forms

时间源与窗口投影仍由 [`track-authoring.md`](./track-authoring.md) 规定。Text 不会发明 `full`、`from`、
`until` 或另一套时序系统。

空间摆放与 Text 排布相互独立。[`spatial-layout.md`](./spatial-layout.md) 中的共享模型提供解析后的
point/frame/path 几何；Text 随后用三种形态之一去解释这份几何。

### 5.1 Point Text

Point Text 是锚定在某个解析点上的固有尺寸文字。它通常紧贴内容、不做软换行，并使用显式的内联/块级锚点。
手动分段仍然有效。常规的标题、标签和贴纸都是 Point Text。

### 5.2 Area Text

Area Text 在解析出的 frame 内排布。它显式选择：

- 内联与块级尺寸：在有意义处使用 `hug | fixed`；
- 四条逻辑边的内边距；
- 内联对齐：`start | center | end | justify`；
- 块级对齐：`start | center | end`；
- 换行：`none | word | grapheme`；
- 溢出：`visible | clip | ellipsis | shrink`；
- 截断/缩放策略下可选的最大行数；
- 书写方向与书写模式；
- 可选的分栏数与栏间距；
- 是否裁剪到摆放 frame；
- 度量边：line box、cap height 或 ink bounds。

溢出是诚实的作者意图。`ellipsis` 可能省略掉可见的被声明文字，因此必须显式写出。`shrink` 必须声明最小
缩放比例，并在完整文字仍放不下时失败；它不得悄悄越过那个下限。这一点与 Caption 不同——Caption 绝不能裁剪
或丢弃作者的显示 Atom。

### 5.3 Path Text

Path Text 消费一条显式自有的矢量路径，外加 Text Document 和 Style。它拥有路径侧、朝向、起止边距、对齐、
反向和溢出。给边距做动画会让文字沿路径移动；给路径做动画则改变路径本身。它绝不会去发现或采样另一个
Track 中的形状。

Path Text 需要一个通用的矢量/路径终端原语，或者一个自有的物化 Surface。它不能靠序列化一段无类型的
SVG/HTML 字符串来声称已实现。

## 6. Typography

Typography 与 Paint、布局相互分离，但参与布局度量。它包括：

- 精确的有序 `FontStackRef`，环境字族名称仅作为显式的原型路径；
- 字号、字重与 normal/italic/oblique 字形；
- 可变字体轴；
- OpenType 特性选择与字体合成策略；
- 字偶距、字距、词间距与行高；
- 语言、方向与书写模式；
- 基线偏移、制表宽度、缩进与段间距；
- 跟随字形度量的下划线/上划线/删除线几何；
- 文字变换、小型大写字母、上标与下标的呈现；
- 所选布局实现支持时的 CJK 专用间距/压缩控制。

精确的字体字节仍是显式的作者图输入。它们不是藏在 Recipe 里的名字，也不由 Runtime 挑选。字体 shaping/布局
实现的身份由被接受的推导/渲染 receipt 绑定；Core 仍然对字体一无所知。

## 7. Ordered Paint model

Paint 是一个有序列表，而不是一组互斥的 CSS 简写。Text Program 拥有这些带类型的 Layer：

```ts
type TextPaintLayer =
  | { readonly kind: "fill"; readonly paint: ColorPaint }
  | { readonly kind: "stroke"; readonly paint: ColorPaint; readonly widthPx: number;
      readonly placement: "inside" | "center" | "outside" }
  | { readonly kind: "shadow"; readonly paint: ColorPaint; readonly offset: Vector;
      readonly blurPx: number; readonly spreadPx: number }
  | { readonly kind: "glow"; readonly paint: ColorPaint; readonly blurPx: number;
      readonly spreadPx: number }
  | { readonly kind: "box"; readonly target: TextPaintTarget;
      readonly continuity: "isolated" | "joined"; readonly decoration: BoxDecoration };
```

`ColorPaint` 支持纯色、线性渐变和径向渐变，带一份有序的颜色与不透明度 stop 列表。重复使用 Stroke 或
Shadow 是合法的，顺序具有语义。渲染器可以用复制字形 Layer 的方式来下降外描边，但那是实现细节，而不是
一个含义随浏览器而变的作者开关。

Box Paint 有这些目标：

```text
frame | content | paragraph | line | run | word | grapheme
```

它的装饰独立拥有填充、border、内边距、各角圆角和阴影。`isolated` 为每个目标创建一个独立的装饰单元。
`joined` 在每一条渲染行内把相邻的被选片段合并，并给该行片段一个诚实的端头。非法组合（例如在 `frame` 上
使用 continuity）会在 Text 校验期失败。

这一条规则就表达了常见的全部情形：

| 外观 | Paint 取值 |
|---|---|
| 普通透明文字 | 不加 Box Paint Layer |
| 整句话一个胶囊 | `target=content` |
| 整个摆放面板 | `target=frame` |
| 每条渲染行一个框 | `target=line, continuity=isolated` |
| 每个词一个 Pill | `target=word, continuity=isolated` |
| 连成一体的马克笔/荧光笔 | `target=word, continuity=joined` |
| 字母块 | `target=grapheme, continuity=isolated` |

气泡尾巴是显式声明、附着在某个 Box Paint Layer 上的部件，带有方位、偏移、尺寸和自己的 Paint。它不会悄悄
强制生成一个背景。毛玻璃不属于普通 Box Paint，因为它要采样 Track 背后的像素；它需要一个显式自有的媒体
输入，或者一个物化的自包含组件。

## 8. Motion and sequence selectors

运动与 Style 相互独立，因此同一套外观可以有不同的入场、循环和退场。一个 item 可以拥有：

1. item 级的有限关键帧，覆盖位置、缩放、旋转、斜切、不透明度、模糊和裁剪；
2. Path Text 的路径边距动画；
3. 一个或多个作用于文字单元的序列动画器。

一个序列动画器是下列各项的乘积：

```text
unit selector × selected property channels × keyframes × stagger/order
```

单元选择器可以指向 paragraph、line、run、word 或 grapheme。它显式选择范围、正向/反向顺序、延迟/扩散、
循环次数以及任何确定性随机种子。属性通道包括局部变换、不透明度、模糊和字形 Paint 值。打字机是这个模型上
的一个字素簇显现预设，而不是字符串切片。滚动字幕和横向滚动只是 Area Text 上普通的 item 级运动。

任何运动名称都不是隐藏的回调。`pop`、`spring`、`slide` 或 `wobble` 这类预设，会在终端渲染之前编译成有限的
或在解析上有界的、由包自有的运动值。两条运动通道通过各自独立的包裹器或显式的变换合成顺序进行合成；后者
不会覆盖前者。

动画的生命期与 Item 的可见性相互独立。一段运动可以在 Item 窗口结束前就完成，此时它最终被声明的状态一直
保持到 Item 消失。一段运动也可以超出窗口，此时 Item 窗口只是裁剪它，而不改写它的时序。序列运动和 Path
Text 运动遵循同样的规则。这既避免了仅仅因为标题一直可见就拒绝一段完全合理的快速标题动画，也避免了为了
塞进短窗口而悄悄给慢速动画重新计时。

## 9. Style declaration, SVS and readable authoring

声明与使用保持分离。SVS 仍是通用的标量 Recipe 语言；它不得学会 Text 的 Paint 数组，也不得变成第二个
渲染器。Text Style Surface 读取具名 Recipe、精确的 Font 引用和重复的结构化 Layer 声明，校验它们，然后产出
一份完整的、由包自有的 `TextStyle` Record。

预期的作者写法是：

```svml
<text:Style id="plain" recipe={studio.text.plain} font={fonts.inter}/>

<text:Style id="word-pills" recipe={studio.text.word-pills} font={fonts.inter}>
  <text:Box target="word" continuity="isolated" recipe={studio.text.word-pill}/>
</text:Style>

<text:Style id="poster" recipe={studio.text.poster} font={fonts.inter}>
  <text:Stroke recipe={studio.text.poster-outline}/>
  <text:Stroke recipe={studio.text.poster-keyline}/>
  <text:Shadow recipe={studio.text.poster-shadow}/>
</text:Style>

<text:Track id="titles" space={film.space}>
  <text:Point id="hook" style={poster} during={story.selection.hook} placement={hook-point}>
    Nothing hidden in the Runtime.
  </text:Point>

  <text:Area id="explanation" style={word-pills} during={story.selection.body} placement={body-frame}>
    <text:P>Every <text:Span style={plain}>visible word</text:Span> stays authored.</text:P>
  </text:Area>
</text:Track>
```

item 也可以改为消费一个普通的图 `Text` 值：

```svml
<copy:Value id="headline">Nothing hidden in the Runtime.</copy:Value>

<text:Track id="titles" space={film.space}>
  <text:Point id="hook" content={headline}
    style={poster} during="program" placement={hook-point}/>
</text:Track>
```

`content={Text}` 与内联正文内容互斥。前者从精确的图值物化出一段纯文本文档 run；后者拥有有界的富文档，
并可使用 `P`、`Span` 和 `Break`。这既阻止了 Frontend 把运行时 Text 复制进隐藏的被声明状态，又让富排版
明确归本包所有。

这套写法在当前共享的时间/空间 Surface 语法上可执行。它的重要性质是：

- 作者导入并选择 Typography 包；
- Style 先声明后使用，并且就是普通的被声明 Record；
- 简单的 Style 值仍然紧凑；
- 重复的 Layer 就是重复的声明，而不是编号字段或编码字符串；
- 解释 Recipe 词汇的是 Markup Surface，不是 SVS；
- 精确字体以及时序/摆放事实都走显式的图边；
- 最终得到的 Text Program 里没有未解析的 Recipe，也没有 Runtime/provider 选择。

## 10. Compiled pipeline and data gates

```text
Markup Surface
  (authored rich document | graph Text input) + named Style + temporal binding + spatial binding
      │
      ▼
Text Program                         package-owned author truth
      │
      ├── located temporal points ──> projected frame windows
      └── resolved spatial geometry
      │
      ▼
Resolved Text Layout
  exact fonts + shaping + wrapping + fragment geometry + motion schedule
      │
      ▼
VisualTrack
  code-free terminal elements/keyframes or typed owned Surface
      │
      ▼
Composition -> selected final renderer
```

每一项外部依赖都由图边承载。Text 值只包含固有的 Text 语义。任何上游 Record 都不会仅仅因为后面某个 Text
消费者需要，就凭空长出 text、role、source、style、font 或 layout 元数据。

布局实现可以使用被锁定的浏览器、HarfBuzz/Skia/Pango 或其他精确引擎。它必须绑定实际的实现和字体字节。
浏览器的 line box 不会作为通用图元数据向外传播；它要么是渲染器 receipt 所拥有的确定性终端布局，要么是包
自有的、用于物化 Surface 的已解析几何。

## 11. Terminal Visual IR findings

冻结的仓库内部 `svml.visual-ir@1` 只承载本次迁移所证明的最小增量：

- `text-flow` 拥有有界富文档、精确 typography、有序 Paint 和序列值；
- `path-text` 拥有带类型的矢量命令和精确的路径排布事实；
- 本地 `mask` 原语恰好拥有一个终端遮罩源和一个内容根；
- 有序可重复的 Paint 与 Unicode 单元动画始终是序列化数据，绝不是回调；
- 精确的字体 Artifact 和带类型的 `CompositableSurface` 值走普通的 Artifact 边界。

HyperFrames 参考编译器实现了这些原语，同时不向作者包暴露 HTML、CSS、SVG 或渲染器脚本。一个单独安装的
非原生 Text fixture 证明了挤出/材质/灯光/相机语义可以留在窄腰之外，只贡献一个带类型的 alpha Surface。
不受支持的富遮罩走同一条路径。

这些始终是视频终端的事实，绝不是 Core 的事实。渲染器 receipt、Surface 字节校验、Deck/Ranking 见证以及最终的
兼容性审计，如今都在不向共享窄腰添加 Text 语义的前提下通过。

## 12. Feedback into Fine Caption

Text 与 Caption 共享的是排版实现难题，而不是作者语义。

下列内容可以通过一个聚焦的视频领域实现库共享（暂定为 `@narratage/typography`）；在真正出现跨包边之前，
它没有 Author Surface，也没有图 Type：

- Unicode 字素簇/词/双向切分；
- 精确的字体栈加载与 shaping；
- 渐变 stop、有序的描边/阴影/辉光以及 box 装饰几何；
- 行片段与 joined Pill 几何；
- 字素簇安全的打字机效果与确定性的选择器求值；
- 终端富文本下降辅助函数。

这并不会造出一个通用的 Text Program。Caption 仍保留 `CaptionDisplaySequence`、Cue、Atom、语音对应关系和
卡拉 OK 时序。Text 仍保留段落、富 run、point/area/path 布局和任意序列选择器。

本次审计发现的、可落到 Caption 上的具体改进是：

1. 允许有序且可重复的 Stroke/Shadow/Glow Layer，取代当前“每种只能一个”的上限；
2. 允许任意渐变 stop，并支持径向渐变而不只是两个 stop 的线性渐变；
3. 复用显式的内/中/外 Stroke 语义，而不是依赖渲染器的描边行为；
4. 复用字素簇安全的文字变换/显现以及精确 shaping；
5. 把 joined 的活动 Pill 几何保留在共享的行片段实现上。

Caption **不得**继承 Text 的 ellipsis、裁剪、缩放适配、路径排布、任意富 run 时序或选择器生成的语音时序。
它始终展示作者完整的不可变 Atom，并且只从已证明的 Atom 窗口激活。

## 13. Migration order and acceptance gates

实现是替换掉早期切片，而不是不断堆砌兼容字段：

1. **已实现：** Text Document、Point/Area 带标签几何、Text Style 和有序 Paint 值；
2. **已实现：** 精确字体、frame/content/paragraph/line/run/word/grapheme 的 Box Paint，以及富 run 静态下降；
3. **已实现：** 共享的 Temporal Window Projection 和显式的 Point/Frame/Path 空间输入；
4. **已实现：** 确定性溢出、方向/书写模式以及浏览器像素证据；
5. **已实现：** item 运动与具备 Unicode 意识的序列选择器；
6. **已实现：** Path Text，外加一个精确有界的本地 Text Mask 和 fail-closed 的物化边界；
7. **已实现：** `CompositableSurface` 逃生路线，以及一个单独安装的非原生 Text 包见证；
8. **已实现：** 在全仓库所有关卡通过之后冻结仓库内部的 Visual IR。

验收至少要求下列各项的浏览器/渲染证据：

- 透明 Point Text 与固定尺寸 Area Text；
- content、frame、多行的 line、孤立 word、joined word 和 grapheme 各种框；
- 跨换行边界的嵌套 run 样式；
- 使用精确字体的拉丁文、CJK、RTL、组合符号和彩色 Emoji；
- 可重复的外/内描边、多重阴影、线性/径向渐变以及辉光；
- visible/clip/ellipsis/有界 shrink 四种溢出；
- item 的入场/退场/循环，以及正向/反向的 grapheme/word/line 序列化；
- Path Text；
- 显式的 Text Mask 归属，以及一个物化的高级效果兜底；
- 不修改 Core、Runtime、Film 或任何无关的 Track 包。

已声明的 Text 包关卡现已全部通过。这确立了一个构建在冻结的仓库内部 Track/Visual IR 窄腰之上的完整预发布
Text 包；npm 发布以及 Text 作者 Surface 自身的公开版本承诺仍是另外的事情。
