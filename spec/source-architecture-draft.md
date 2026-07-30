# SVML Source Architecture Draft

> **Draft; not frozen.**
>
> 本文记录 2026-07-30 对完整 SVML 源码架构的当前共识。已经冻结的稿子语法仍以
> [Script Surface v1](./script-surface-v1.md) 为准；本文中的文档外壳、跨文件
> import、组件调用、参数表和引用写法仍需原型验证后才能冻结。

SVML 是视频的源语言，不是画布文件，也不是最终像素格式。编译器展开当前影片
及其全部 import，得到可检查的语义 DAG；运行时能力返回媒体与对齐证据，Locate
把语义时间统一量化，最后确定性地产出 HyperFrames HTML。

```text
.svml + transitive imports
        │
        ▼
parse / bind / typecheck / expand
        │
        ▼
Plan IR (values · calls · ports · topology)
        ├──────────────> Canvas/DAG view
        └──────────────> Estimate timeline
        │
        ▼
Capability Host (generation · alignment · media probe)
        │
        ▼
Locate
        │
        ▼
Located IR
        │
        ▼
Imported render components
        │
        ▼
HyperFrames HTML
```

Canvas 和 Timeline 是 IR 的人类视图，不是第二份作者真相。Pin、take、缓存、
任务和运行状态不进入 SVML 源码。

## 1. 四种文件

四种文件的分界不是 free/paid，也不是当前画布的五层，而是「定义词」「规则」
「具名内容」「一条影片」：

| 文件 | 只负责 | Web 类比 |
|---|---|---|
| `.svk` | 定义组件词汇、类型、端口、声明性展开和渲染实现 | Web Component / component package |
| `.svs` | 给已有组件提供可复用的参数规则和预设 | typed CSS |
| `.svc` | 声明可复用的具名内容值和内容生成子图 | data/module/`<defs>` |
| `.svml` | 当前影片的 Script、片内调用、语义时间放置、Tracks 和 Film | HTML document / main |

放置一项源码时依次问：

```text
它在定义一个新词吗？
├─ 是：.svk
└─ 否
   ├─ 只属于这一条影片：.svml
   └─ 能脱离当前影片复用
      ├─ 是一条规则：.svs
      └─ 是一个具名的东西或内容子图：.svc
```

文件后缀是复用和职责边界，不是强制外置规则。一个只用一次的 Prompt 或参数
应直接留在 `.svml`，不应为了“整齐”制造只有一次引用的旁路文件。

## 2. 值、端口与来源

`Text`、`Image`、`Audio`、`Video` 是值类型，不因来源不同而成为不同语言对象：

```text
local.png       ─┐
GPT Image(...)  ─┴─> Image

local.mp4       ─┐
Seedance(...)   ─┴─> Video
```

对 Track 的 `Video` 输入端口而言，上传文件和 Seedance 输出没有身份差异。所谓
“input”只是值位于某个消费者端口的位置，不是一种特殊节点或源语言层。

组件实例的具名引用构成 DAG 边；同一个输出被多个消费者引用就是 fan-out，不
需要复制值，也不需要声明所有权对象。编译器必须能在运行前打印展开后的全部
调用、参数、输入端口、输出端口和边。

建议的统一表面规则是：

```svml
prompt="A #1 product"              <!-- 整个属性是字面量 -->
prompt={brand.poster-prompt}       <!-- 整个属性是引用 -->
image={poster.image}               <!-- 组件输出端口 -->
during={script.selection.hook}     <!-- SelectionSet -->
at={script.moment.pop}             <!-- MomentSet -->
```

引号内不做插值，不扫描 `#`、`@` 或花括号。引用由整个属性值的结构决定，不能
寄生在 Prompt 正文里。长文本可以放到组件的显式文本子元素中，仍按字面文本
处理。

## 3. `.svk`: 定义词汇

`.svk` 定义一个可直接 import 的组件。至少需要声明：

- 标签名及内容模型；
- 输入和输出端口及其类型、cardinality；
- temporal port 接受 `SelectionSet` 还是 `MomentSet`；
- 声明性的调用和数据流展开；
- Located props 到 HyperFrames DOM 的渲染实现；
- 编译器可以执行的静态诊断合同。

`gpt-image`、`seedance`、`ranking-track`、`caption-track` 和 `film` 都不应是
编译器里的特殊分支；它们只是 stdlib `.svk` 中预先 import 的组件。用户组件
和 stdlib 组件走同一套机制，不需要中央注册、晋升或 Engine 发布。

生成拓扑不能藏在任意 JavaScript 黑盒中。渲染内部可以对编译器不透明，但模型
调用、依赖、fan-out、端口和成本相关事实必须通过声明性展开进入 Plan IR。

Capability Host 仍然存在：它负责凭证、队列、重试以及真正调用 Seedance、
GPT Image、WhisperX 等底层能力。这里的“无引擎”是没有中心组件注册引擎，不是
没有编译器、宿主或浏览器运行时。

## 4. `.svs`: 参数规则

`.svs` 是 typed stylesheet。它配置已经由 `.svk` 定义的组件，不定义内容、
实例、素材身份或拓扑。

```svml
<sheet version="1" id="house">

  seedance.host {
    model: seedance-2-mini;
    resolution: 720p;
    framing: medium;
    performance: calm-authority;
  }

  ranking-track.launch {
    board-color: #141414;
    radius: 28px;
    row-gap: 18px;
  }

  caption-track.launch {
    font-family: Inter;
    font-weight: 700;
    fill: #FFFFFF;
  }

  film.vertical {
    aspect: 9:16;
    resolution: 1080x1920;
    frame-rate: 30;
  }

</sheet>
```

当前建议：

- 不按 free/paid 拆成两套语法；
- 不在语言里记录改动后的重跑范围；
- 不把 Track、lane 或 layer 拓扑藏进 `.svs`；
- 不把人物、图片、Prompt 正文等具名内容放进 `.svs`；
- 允许模型、分辨率、framing、字体、颜色、fill 等参数使用同一套规则机制；
- 不采用 CSS specificity、`!important`、父子选择器或按文件顺序静默覆盖；
- 组件默认、sheet 规则、显式 class 和元素属性的解析过程必须可解释。

确切 selector/class 与 override 语法尚未冻结。无论采用何种表面，直接写在
当前实例上的参数拥有最终解释权。

## 5. `.svc`: 具名内容与内容 DAG

`.svc` 是 context-free content module。它可以包含：

- 具名 `Text`、`Image`、`Audio`、`Video` 和外部文件；
- 产品名、发音、Tagline、人物照片、音色引用；
- 可复用的长 Prompt；
- 不依赖当前 Film Script 的 GPT Image、Seedance 和转换调用；
- 由这些值组成的可复用、可静态展开内容子图；
- 不含绝对时间的具名渲染片段。

示意：

```svml
<content version="1" id="launch">

  <import from="./kits/generation.svk"/>

  <image id="logo" src="./assets/logo.png"/>
  <image id="host" src="./assets/host.png"/>

  <text id="poster-prompt">
    A #1 launch poster for Hypit.
    Deep black background and electric violet typography.
  </text>

  <gpt-image
    id="poster"
    prompt={poster-prompt}
    reference={logo}
  />

  <seedance
    id="product-wide"
    image={poster.image}
  >
    <prompt>
      Slow cinematic push-in. Preserve the logo and all typography.
    </prompt>
  </seedance>

  <seedance
    id="product-close"
    image={poster.image}
  >
    <prompt>
      Macro close-up with subtle parallax.
    </prompt>
  </seedance>

</content>
```

一个 `.svc` 不得隐式读取 import 它的 `.svml` 中的 `script.*` 名字，也不得
放置依赖当前 Script Selection/Moment 的 Track item 或最终 Film root。否则
模块会因导入上下文不同而静默变义。

未来如确实需要参数化 `.svc`，它必须显式声明输入，并由 `.svml` 显式绑定；
不得给 `.svc` 一个隐式的 importer Script 全局变量。参数化模块不属于当前
冻结范围。

## 6. `.svml`: 当前影片

一份可执行 `.svml` 最终只需要表达：

```text
imports
+ Script
+ 依赖当前 Script 的内容生成
+ 其他只属于本片的内容生成
+ N Tracks
+ exactly one Film
```

`<values>` 不是必需的独立层：可复用值进入 `.svc`，本片一次性值可直接在
`.svml` 中具名声明或内联。`<output>` 也没有必要：类型系统要求恰好存在一个
未被其他组件消费的 Film/Composition root；零个或多个 root 都是编译错误。
输出路径、编码和是否转 MP4 属于 CLI/运行时参数。

`<program>` 是否保留为纯排版容器尚未冻结。它不得引入新的作用域或执行语义。

示意：

```svml
<svml version="1">

  <import from="./kits/generation.svk"/>
  <import from="./kits/tracks.svk"/>
  <import from="./kits/hyperframes.svk"/>

  <import as="house" from="./house.svs"/>
  <import as="content" from="./launch.svc"/>

  <script>
    @hook
    <segment id="hook">
      <A> Video creation is about to change.
    </segment>
    @/hook

    @product
    <segment id="product">
      <A> Meet Hypit.
    </segment>
    @/product
  </script>

  <!-- 依赖当前 Script，因此不能搬进 context-free .svc。 -->
  <seedance
    id="hook-aroll"
    class="house.host"
    image={content.host}
    dialogue={script.segment.hook.dialogue}
  />

  <seedance
    id="product-aroll"
    class="house.host"
    image={content.host}
    dialogue={script.segment.product.dialogue}
  />

  <base-track id="base">
    <item
      video={hook-aroll.video}
      during={script.selection.hook}
    />
    <item
      video={product-aroll.video}
      during={script.selection.product}
    />
  </base-track>

  <broll-track id="broll">
    <item
      video={content.product-wide.video}
      during={script.selection.hook}
    />
    <item
      video={content.product-close.video}
      during={script.selection.product}
    />
  </broll-track>

  <caption-track
    id="captions"
    class="house.launch"
    script={script}
  />

  <film id="main" class="house.vertical">
    <layer track={base.track}/>
    <layer track={broll.track}/>
    <layer track={captions.track}/>
  </film>

</svml>
```

## 7. Script 依赖规则

内容放进 `.svc` 还是留在 `.svml`，最终按依赖判断，不按 A-roll/B-roll 的名字
判断：

```text
transitive dependencies contain script.*
├─ yes: current-film declaration in .svml
└─ no: may be extracted into .svc when reuse is valuable
```

| 内容 | 通常归属 | 原因 |
|---|---|---|
| 根据当前台词生成的 A-roll | `.svml` | 依赖 dialogue、实际读音、Estimate 和 turn |
| 固定采访片段或人物介绍片 | `.svc` | 可脱离当前 Script 成立 |
| 跨影片复用的产品演示 B-roll | `.svc` | 是内容资产 |
| 专门为当前一句话生成的 B-roll | `.svml` | 是本片特有计算 |
| Host 图片、音色、Logo | `.svc` | 具名、可复用内容 |
| Seedance model、framing、performance | `.svs` | 可复用参数规则 |

A-roll 的人物图片、音色和参数预设可以分别来自 `.svc` 与 `.svs`，但把当前
`script.segment.*.dialogue` 传给 Seedance 的调用实例属于 `.svml`。

这条规则与运行时复用无关。一个 A-roll take 可以被缓存或 Pin，但那是执行
状态；不能因为曾经复用过一次，就把一个语义上依赖旧 Script 的调用改写成
context-free `.svc` 内容。

## 8. 当前需要原型验证的部分

在冻结完整文档格式前，至少验证：

1. `.svk` 能同时定义纯 HTML comment、multi-item ranking 和多阶段 B-roll，
   且编译器不按 tag 名写特殊分支；
2. `.svc` 中的多级生成和 fan-out 能完整进入 Plan IR；
3. Script-dependent A-roll 留在 `.svml` 后，Estimate/Evidence/Locate 的数据
   依赖没有隐式边；
4. `.svs` 能配置视觉和模型参数而不引入 cost/rebuild 语义；
5. import 展开后的全部源码、参数和实现能被冻结，保证离线复现；
6. Canvas/DAG view 和 Timeline view 都只消费 IR，不成为新的作者真相。
