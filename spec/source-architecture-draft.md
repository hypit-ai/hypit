# SVML Source Architecture Draft

> **Draft; not frozen.**
>
> 本文记录截至 2026-07-31 对完整 SVML 源码架构的当前共识。已经冻结的稿子语法仍以
> [Script Surface v1](./script-surface-v1.md) 为准；本文中的文档外壳、跨文件
> import、组件调用、参数表和引用写法仍需原型验证后才能冻结。

SVML 是视频的源语言，不是画布文件，也不是最终像素格式。一个可编译单元是
当前 `.svml`、它的全部传递 import 和锁文件组成的 **source closure**。编译器
展开 source closure，得到可检查的语义 DAG；运行时能力返回媒体与语音对齐
证据，Locate 把所有时间统一量化，Track projector 再确定性地产出
HyperFrames HTML。

```text
.svml + transitive .svk/.svs/.svc imports + svml.lock
        │
        ▼
parse / bind / typecheck / expand
        │
        ▼
Plan IR (values · calls · ports · topology · effective params · provenance)
        ├──────────────> Canvas/DAG view
        └──────────────> Estimate timeline
        │
        ▼
Capability Host (media materialization · Speech Compile · media probe)
        │
        ▼
Locate (Base Clock · temporal projection · deterministic space)
        │
        ▼
Located IR
        │
        ▼
Imported Track projectors
        │
        ▼
private HyperFrames Document AST
        ├──────────────> Visual Surface Tree
        └──────────────> Audio Tree
        │
        ▼
HyperFrames HTML (the sole formal final compile target)
```

Canvas/DAG、Estimate Timeline 和 Located Timeline 都是为了人类查看与修改而
投影出的 IR 视图，不是第二份作者真相。Visual Surface Tree 和 Audio Tree
只是编译器私有的 HyperFrames lowering 结构，不是另一门作者语言、公共存储
格式或另一台“引擎”。MP4 等成片是运行、录制或封装该 HTML 的结果，不是另一个
语义编译目标。

这就是“新引擎”的严格含义：它是 **SVML compiler/runtime → HyperFrames
HTML**，不是再发明一套与 HyperFrames 并列的渲染引擎。新能力通常通过 import
新的 `.svk`、`.svs` 或 `.svc` 并更新锁文件获得；只有源语法、公共 ABI、基础
值类型或 HyperFrames target 改变时才需要发布编译器。Pin、take、缓存、任务和
运行状态不进入 SVML 源码。

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
它在定义一种可直接调用的新能力吗？
├─ 是：.svk
└─ 否
   ├─ 只属于这一条影片：.svml
   └─ 能脱离当前影片复用
      ├─ 是一条规则：.svs
      └─ 是一个具名的东西或内容子图：.svc
```

文件后缀是复用和职责边界，不是强制外置规则。一个只用一次的 Prompt 或参数
应直接留在 `.svml`，不应为了“整齐”制造只有一次引用的旁路文件。

判断一项变化是否值得新建 `.svk`，不看底层代码是否相似，而看调用者可见的
合同是否改变：

| 变化 | 归属 |
|---|---|
| 输入/输出端口、cardinality 或动态 item schema 改变 | 新 `.svk` |
| 子元素内容模型、temporal port 类型或能力的不变量语义改变 | 新 `.svk` |
| 只是已有参数的默认值、视觉风格或合法值组合改变 | `.svs` |
| 只是运行时代码重构，公开合同不变 | 不改变任何 SVML 源码 |
| 可复用的具名文本、素材或内容子图 | `.svc` |
| 当前影片的实例、Script 依赖、拓扑或 Film 组装 | `.svml` |

这条线使 `ranking-tier-list` 与 `ranking-typewriter` 因 item schema 不同而成为
两个 Kernel；同一个 `caption-track` 的字体、颜色和已有 recipe 组合则仍然是
SVS 参数规则。SVS 不能新增、删除或改型端口、内容槽和拓扑。

### 1.1 统一 Import

四种文件使用同一种 import 表面，扩展名和被导出符号决定导入角色：

```svml
<import as="speaker" from="./kernels/seedance-speaker.svk"/>
<import as="house"   from="./house.svs"/>
<import as="brand"   from="./brand.svc"/>
```

`from` 以后可以由本地路径、Git 或 registry resolver 满足，但来源不改变语言
语义。`as` 是当前文件的本地绑定或命名空间；省略时，导出名进入当前作用域。
同一个作用域出现歧义必须报错并要求显式别名，不能由后导入者覆盖先导入者。

Import 顺序不携带语义。编译器按引用建立完整、无环的依赖 DAG，再统一 bind；
作者不需要为了满足依赖而手工排序 import。具体 package 地址、下载缓存和
registry 发现协议暂不冻结，但编译结果必须保留每个解析后来源的规范 URI 与
内容哈希。不存在按裸名字查找 family、合并同名能力或选择“最权威实现”的步骤。

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

所有跨声明引用都使用稳定名字。语言不提供 `node[3]`、`segment:4`、
`nth-child` 或“当前列表第 N 项”这样的外部寻址；文档插入一个实例后，既有
引用不得静默改指。Ranking items 等集合本身可以有语义顺序，但其中某一项若要
被集合外引用，就必须声明稳定 id。

### 2.1 Import、声明与执行可达性

Import 只把符号带入作用域，声明只定义一个值或调用；两者都不产生执行副作用。
编译器先解析、绑定并检查完整的 transitive module graph，再以当前文档唯一的
`Film` root 为起点，沿输入引用反向求出执行可达子图：

```text
Film
├─ Speech Spine
│  └─ ordered Segment media + Script bindings
└─ Track[]
   └─ Item[]
      ├─ Present[]
      └─ Media / Content
         └─ Kernel calls
            └─ Inputs
```

只有这棵可达子图中的调用才成为 Plan IR execution instances，交给
Capability Host、Locate 和 HyperFrames，并默认投影到当前 Canvas/DAG 与
Timeline。导入一个 kit 不会运行其中全部 Kernel；导入一个声明了十项内容的
`.svc`，当前 Film 只引用两项就只执行那两项及其传递依赖。

不可达声明仍然是可解析、可检查和可供工具浏览的源码定义，但不触发 provider、
渲染或其他运行时回调。编译器可以报告 unused declaration，Canvas 也可以提供
“查看未使用定义”的独立视图；它们不能被混进当前 Film 的执行 DAG。若未来需要
单独构建某个内容值，应由工具显式选择另一个临时 root，不改变 SVML 默认语义。

### 2.2 稳定编译身份

每个进入 Plan IR 的实例都必须拥有与源码版式无关的稳定身份。规范身份由以下
部分确定：

```text
Plan instance identity
= canonical module identity
+ declaration id
+ deterministic expansion key path
```

模块内容哈希属于 provenance，不进入 identity；否则改一个参数就会把原实例
伪装成新实例。行号、源码 offset、同类标签序号、import alias/顺序、Canvas
坐标和 formatter 结果同样不得参与 identity。仅重命名本地 alias、重新排序
import、移动一段声明或运行 `svml fmt`，不能让 Canvas 把既有实例解释为
“删除后新建”。

一个 Kernel 若会把动态 item 展开成多个独立 Plan/Canvas 实例，其 SVK schema
必须声明如何从稳定字段得到 expansion key，并拒绝重复 key。只在 Kernel 内部
参与绘制、不会成为独立实例或外部引用目标的匿名有序行可以没有 id；一旦某一项
要跨实例引用、单独投影或跨次编译保留身份，就必须有稳定 id/key，不能使用数组
下标兜底。

稳定身份不能兼任缓存命中条件。每个可执行实例还必须拥有独立的执行摘要：

```text
executionDigest
= locked Kernel implementation + public ABI version
+ effective parameters + deterministic lowering result
+ transitive input artifact hashes
```

`instanceIdentity` 用于 Canvas 身份、诊断和跨次编辑关联；`executionDigest`
用于自动缓存、take 兼容性和执行失效。改 Prompt 或参考图时，前者保持不变，
后者必须改变。

Pin 仍是源码外的显式作者决定，而不是自动缓存。用户可以明确要求旧 artifact
继续供给同一类型端口，即使当前 `executionDigest` 已改变；只有输出类型、schema
或其他硬合同不兼容时才拒绝。下游摘要使用实际被 Pin 的 artifact hash，因此
复用是可见、可追踪的，不会伪装成新参数下重新生成的结果。

## 3. `.svk`: 定义平级 Kernel

`.svk` 定义一个可直接 import、调用和验证的 Kernel。所有 Kernel 使用同一种
清单形状；生成、素材变换、Track 和 Film 不因执行阶段不同而获得不同的语言级
类别。一个完整 Kernel 至少声明：

- 导出的调用名、内容模型及允许的子元素；
- 输入和输出端口及其类型、cardinality、动态端口或 item schema；
- 参数类型、合法值、默认值和必填约束；
- temporal port 接受 `SelectionSet`、`MomentSet` 还是手工 `ProgramSpan`，以及
  它按 `one`、`each` 还是 `set` 消费 occurrence；
- 声明性的调用、数据流展开和 Capability lowering；
- 受限运行时入口和/或 Located props 到 HyperFrames fragment 的 projector；
- 编译器可以执行的静态诊断合同。

并非每个 Kernel 都同时具有运行时和渲染实现：`gpt-image` 只需调用能力并产出
`Image`，`ranking-tier-list` 可以只确定性地产出 `Track`，`film` 则消费
`Track[]` 并产出最终 `Film`。这些差异由端口和清单内容表达，不新增
`cue`、`transform`、`generation` 等第二套声明机制。

`gpt-image`、`seedance-speaker`、`seedance-broll`、`ranking-tier-list`、
`ranking-card-stack`、`caption-track` 和 `film` 都不应是编译器里的特殊分支；
它们只是彼此平级的 `.svk`。用户 Kernel 和 stdlib Kernel 走同一套机制，不需要
中央注册、晋升或 Engine 发布。

生成拓扑不能藏在任意 JavaScript 黑盒中。渲染内部可以对编译器不透明，但模型
调用、依赖、fan-out、端口、调用参数和输出类型必须通过声明性展开进入 Plan IR。

Capability Host 仍然存在：它负责凭证、队列、重试以及真正调用 Seedance、
GPT Image、WhisperX 等底层能力。这里的“无引擎”是没有中心组件注册引擎，不是
没有编译器、宿主或浏览器运行时。

### 3.1 平级而非 Family / Mode

SVML v1 不定义 `family`、`implements`、继承或语言级 `mode`。所有 Kernel
彼此平级；每个 Kernel 完整拥有自己的端口、参数、默认值、展开和实现合同。
编译器只检查一个调用是否满足它实际引用的那个 Kernel，不检查它是否符合
`ranking`、`seedance` 或其他产品类别的共同契约。

因此，底层实现和端口确实不同的 Ranking 应直接成为不同 Kernel：

```svml
<ranking-tier-list .../>
<ranking-card-stack .../>
<ranking-bracket .../>
```

Seedance 的常用能力也优先发布成多份明确的 Kernel：

```svml
<seedance-speaker .../>
<seedance-podcast .../>
<seedance-motion-ref .../>
<seedance-camera-ref .../>
```

多份 `.svk` 不要求底层代码复制。它们可以在普通 TypeScript、Python 或其他
运行时模块中共享请求、轮询、Prompt 组装和 provider adapter；代码复用属于
实现层，不上升为 SVML 的继承系统。一个作者也可以在自己的单个 Kernel 中
声明普通枚举参数，但该参数没有跨 Kernel 的 `mode` 语义。

`ranking`、`generation`、`track` 等共同认识只作为文档、检索、市场分组和
Canvas 分类元数据，不参与类型身份或编译解析。Kit/Package 也只是下载与
re-export 边界，可以同时导出毫无共同父契约的 Kernel、SVS 和 SVC；其 index
不需要提取这些导出物的最大公约数。

这项取舍有意放弃“任意 Ranking 实现都可热切换”的承诺。现实中端口、条目
结构和输出不同的实现本来就不可无损替换；若未来出现一组被真实使用证明为
完全同构、且确需替换的 Kernel，再以独立提案增加可选协议，v1 不预支复杂度。

语言级拆分的精确判据是：

```text
调用者可见的端口、内容模型、时间类型或能力不变量改变了吗？
├─ 是：新的平级 Kernel
└─ 否
   ├─ 只是参数值或外观组合：SVS
   └─ 只是实现重构：仍是原 Kernel
```

普通枚举参数只适合表达同一公开合同内的有限选择，不能借它偷偷切换必填端口、
item schema、拓扑或强制 Prompt 含义。是否共用一段底层代码不参与这个判断。

### 3.2 生成指令的三层分工

生成组件最终发给模型的 provider prompt 是编译产物，不等于作者在源码中填写
的 `prompt`。它由三层信息组成：

```text
provider prompt
= kernel invariant contract
+ typed direction modules
+ instance content
```

三层的源码归属不同：

1. **Kernel invariant contract 属于具体 `.svk`。** 身份保持、角色/音色映射、
   参考素材各自代表什么、`seedance-motion-ref` 只搬身体动作、
   `seedance-camera-ref` 只搬镜头等，都是该 Kernel 的定义，不能被
   stylesheet 或内容模块偷偷替换。
2. **正交导演轴由 `.svk` 定义和 lowering，由 `.svs` 选择。** `framing`、
   `camera`、`edit`、`pace`、`performance`、`reaction`、`gesture`、
   `story-shape`、`motion-intensity` 等是类型化参数，不是 Prompt 正文。
   `.svk` 定义允许值、默认值及每个值如何编译；`.svs` 只组合和覆盖这些值。
3. **实例内容属于 `.svml` 或 `.svc`。** 依赖当前 Script 的动作、故事或运动
   描述留在 `.svml`；能脱离当前影片复用的具名长文本可以进入 `.svc`。

因此 `.svs` 不保存 `calm-authority` 对应的长篇英文 Prompt；它只写
`performance: calm-authority`。`.svc` 可以保存某个具名产品演示故事，但不
充当所有 Seedance 实例的隐式默认 Prompt 注册表。

源语言应尽量使用具体 Kernel 对应的语义槽，而不是把所有作者内容都叫作
`prompt`：

```svml
<seedance-speaker ...>
  <direction>Lean toward the camera on the final sentence.</direction>
</seedance-speaker>

<seedance-broll ...>
  <story>A hand opens the app, then the result snaps into focus.</story>
</seedance-broll>

<seedance-keyframe ...>
  <motion>The camera arcs slowly while the product remains centered.</motion>
</seedance-keyframe>
```

各 Kernel 可以分别规定这些槽为必填、可选或禁止。例如
`seedance-speaker`、`seedance-podcast`、`seedance-call` 可以仅凭 Script 与
自身 contract 成立，额外 `direction` 可选；`seedance-broll` 需要 `story`，
`seedance-keyframe` 需要 `motion`，通用 reference Kernel 需要说明目标动作；
`seedance-motion-ref` 与 `seedance-camera-ref` 的核心含义已经由各自 Kernel
给定，只需允许可选补充指令。

### 3.3 编译器、Capability Host 与渲染边界

SVK 可以实现 HTML、CSS、SVG、Canvas、GSAP、Lottie、Three.js 或其他
HyperFrames 可承载能力，但“只许改组件根节点”不能只写成规范愿望。在同一
document 中，普通 JavaScript 能访问全局 DOM，普通 CSS 也能越过组件边界；
Shadow DOM 只能形成样式边界，不是 JavaScript 安全边界。因此根节点是
**composition contract**，不是 security boundary。

SVK manifest 必须把入口拆成宿主可执行的有限 ABI：

```text
static expand        source declarations → typed Plan fragment
capability lowering  typed request → declared artifact/evidence
track projection     Located props → HyperFrames fragment
```

- `static expand` 必须纯、确定、无 I/O，并满足无环展开、终止条件和实例数上限；
- `capability lowering` 只能通过宿主注入的类型化 capability handle 访问
  provider，不能接触其他 capability 的凭证；
- `track projection` 只获得 scoped root、Located props、确定性 frame clock、
  显式 seed 和已声明资源；默认没有网络、墙钟、未注入随机源或全局 DOM；
- 声明式 projector 可由宿主直接解释；可执行 projector 必须精确锁定，并按
  宿主信任策略在隔离 realm/iframe 或明确受信进程中运行；
- 第三方 CSS 必须 scope；第三方 JavaScript 不能因为使用 Shadow DOM 就被视为
  已隔离；
- 一个实现需要的 capability、网络或其他权限必须在 manifest 声明并进入
  `svml.lock`，宿主可以拒绝。

这些是 compiler/runtime 的 effect 与安全合同，不是要求作者在 `.svml` 中把
调用分成 `generation`、`analysis`、`render`、`export` 四类，也不记录所谓
“重跑范围”。业务 Kernel 仍然平级；固定阶段只用于阻止 provider 代码在 parse
时执行、renderer 反向改变 Speech Spine、循环展开和越权访问。

Capability Host 只接收 Kernel lowering 后的类型化调用，并返回声明过的输出与
证据。凭证、队列、重试和 provider SDK 可以对源语言不透明；调用、依赖、
fan-out、端口、生成参数和输出类型不能藏在任意运行时代码里，必须先进入
Plan IR。Track projector 只把已经 Located 的值编译为 HyperFrames fragment，
不能回写 Plan、改动 Base Clock 或产生新的 provider 调用。

### 3.4 零特权验收

随编译器发货的 stdlib Kernel 和第三方 Kernel 必须经过同一 parser、binder、
typechecker、expander 与 renderer 接口。下列真实能力是 SVK 格式的最小验收
集，而不是允许编译器按 tag 名特判的白名单：

| 验收 Kernel | 必须证明的表达力 |
|---|---|
| `gpt-image` | 多参考输入、具名输出与 fan-out |
| `seedance-speaker` | Script 投影依赖、媒体生成和运行时证据 |
| `seedance-reference` | 异构输入、多端口与多输出 |
| `ranking-tier-list` | 动态 items、必填字段和枚举校验 |
| `speech-spine` | 唯一 Program Clock、主口播音频、Segment 绑定和同步 Visual Facet |
| `media-track` | Item/Present、共享播放映射、语义与手工窗口、局部 layer |
| `broll-track` | 多 item、跨 Segment Selection、组合序列、交叉转场与音频贡献 |
| `caption-track` | Script/Narrative IR 到 Track 的确定性映射 |
| `film` | 一个 Speech Spine、多 Track、全局 z 与音频树组装、唯一根输出 |

如果其中任一个必须在编译器里按名字写专用业务分支，说明公开 SVK 清单仍缺
表达力。Script parser、基础值类型、Selection/Moment、模块解析和编译各相属于
用来定义 Kernel 的语言内核，不能被某份 SVK 重定义；业务能力本身没有特权。

## 4. `.svs`: 参数规则

`.svs` 是 typed stylesheet。它配置已经由 `.svk` 定义的组件，不定义内容、
实例、素材身份或拓扑。

```svml
<sheet version="1" id="house">

  seedance-speaker.host {
    model: seedance-2-mini;
    resolution: 720p;
    framing: medium;
    performance: calm-authority;
  }

  ranking-tier-list.launch {
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

参数值只允许一条可解释的解析链：

```text
Kernel 默认值
  → 当前实例显式列出的 SVS class（从左到右）
  → 当前实例属性
```

直接写在实例上的参数拥有最终解释权。两个已导入 sheet 的同名 class 不会按
import 或文件顺序决胜；作者必须通过 import alias 明确引用。Plan IR 中每个
effective parameter 都要保留最终来源和被覆盖链，因此 Canvas、agent 和未来的
`svml explain` 可以回答“这个值从哪来”，而不是重新运行一遍 CSS 猜测。

确切 selector/class 表面与是否需要显式 override 块尚未冻结，但不得改变上述
三层顺序，也不得增加隐式 specificity。SVS 只是统一参数系统，不携带成本、
重跑、缓存或 Pin 语义。

## 5. `.svc`: 具名内容与内容 DAG

`.svc` 是 context-free content module。它可以包含：

- 具名 `Text`、`Image`、`Audio`、`Video` 和外部文件；
- 产品名、发音、Tagline、人物照片、音色引用；
- 可复用的长 Prompt；
- 不依赖当前 Film Script 的 GPT Image、Seedance 和转换调用；
- 由这些值组成的可复用、可静态展开内容子图。

`.svc` 不保存可执行 DOM/CSS/JavaScript 或匿名“渲染片段”。可执行的
HyperFrames projection 必须由具名 `.svk` 定义；`.svc` 只能给该 Kernel 提供
类型化数据。这样内容模块不会偷偷成为一份绕过 ABI 和锁文件的匿名 Kernel。

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

  <seedance-broll
    id="product-wide"
    image={poster.image}
  >
    <story>
      Slow cinematic push-in. Preserve the logo and all typography.
    </story>
  </seedance-broll>

  <seedance-broll
    id="product-close"
    image={poster.image}
  >
    <story>
      Macro close-up with subtle parallax.
    </story>
  </seedance-broll>

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
+ exactly one Speech Spine
+ N Tracks
+ exactly one Film
```

`<values>` 不是必需的独立层：可复用值进入 `.svc`，本片一次性值可直接在
`.svml` 中具名声明或内联。`<output>` 也没有必要：类型系统要求恰好存在一个
未被其他组件消费的 Film/Composition root；零个或多个 root 都是编译错误。
输出路径、编码和是否转 MP4 属于 CLI/运行时参数。

`<program>` 是否保留为纯排版容器尚未冻结。它不得引入新的作用域或执行语义。

### 6.1 Speech Spine 是时间基底，不是视觉底片

一条影片有且仅有一个 Speech Spine。它按顺序把 Script Segment 与 `Audio` 或
`Video` 媒体绑定，产出：

- 全片唯一的 Program Clock、结构切点和主口播音频；
- 全局 Speech Alignment 与 Temporal Anchor Map；
- 每个 Segment 的 ProgramRange；
- 视频型 Segment 可选的、静音且已与 Program Clock 同步的 Visual Facet。

Spine Segment 不写 `during=`，因为它建立的正是所有 Selection/Moment 被 Locate
到全局时间的前提。Spine 也不决定 Visual Facet 以全屏、分屏还是画中画出现；
Visual Facet 作为同步媒体进入普通 Track Item。音频型 Segment 没有 Visual
Facet，空镜、背景和其他铺底仍是普通 Track Item。

因此旧实现中的 `Base Track` 被拆成两个角色：

```text
Speech Spine = Program Clock + primary speech audio + alignment + synchronized facets
Visual Track = 在既定 Program Clock 上显示媒体
```

当前 Base v4 把一份 `MediaPresentation` 挂在整个视频 Segment 上，属于实现期
兼容形状，不应固化为 SVML 源语言。Base FX 也不承担正常布局；分屏、圆形裁切、
位置、透明度和相对动画属于 Item/Present。

“主口播音频”不等于“全片唯一允许的音频”。B-roll 的视频原声、Track 自带的
转场音效、Ranking 出现音效、BGM 和独立 SFX 都可以由相应 Track 直接贡献给
Film 的 Audio Tree；不要求为了每个声音再复制一份独立 Audio Track。独立
Audio Track 只用于确实独立编排的声音。

新架构不引入 `audioCueIntent`。它是当前引擎为若干节点转接音频提示的兼容形状，
不是 SVML 源词汇，也不是新的公共 IR 合同。Kernel 应把 `source-audio`、
`enter-sound`、`appear-sound` 等自己公开的类型化参数直接 projector 为
HyperFrames audio fragment。

### 6.2 Material、Track Item、Occurrence 与 Present

`Item` 没有被 `Present` 取代，但也不能被语言内核硬定义成“一次连续播放”。
四个概念分工如下：

```text
Material           = Image / Video / Audio 等可 fan-out 的内容值
Track Item         = 某个 Track Kernel 定义的一项作者输入
Located Occurrence = Track 将一个时间 occurrence 降低后得到的一次连续使用
Present            = 同一 Located Occurrence 上的一个定时显示 surface
```

SelectionSet 必须永久保留全部有序、可非连通的 occurrences；语言核心不得为了
迎合某一种 Track 而把它偷偷拍平为一个连续区间，也不得默认只取第一段。每个
temporal port 由其 `.svk` 声明消费合同：

```text
one   exactly one occurrence; otherwise type/cardinality error
each  one stable Track/Located instance per occurrence
set   receive the complete ordered SelectionSet as one typed input
```

多样式字幕典型地使用 `set`，因为一个样式规则需要一次看到所有非连通命中；
普通媒体 Track 常使用 `each`，让每个 occurrence 各自建立连续播放映射；
明确只接受一个窗口的组件使用 `one`。这是谁消费集合的问题，不是 Script 是否
允许非连通的问题。若某个 Track 需要更复杂语义，应通过自己的公开 item schema
在这三种合同之上表达，不能让编译器按 Track 名猜。

对使用 `each` 的媒体 Track，每个 Located Occurrence 都有稳定 occurrence
identity 和且仅有一个 ProgramRange，随后才建立 source-time mapping。因而
`stretch`、`loop`、`native` 不再面对“跨 gap 怎么播放”的歧义：

```text
SelectionSet occurrence[0] → MediaUse A → mapping M₀(t)
SelectionSet occurrence[1] → MediaUse B → mapping M₁(t)
```

一个媒体 Item 至少拥有稳定 `id`、`source`、temporal placement、playback、
基础 presentation，以及零到多个具名 Present。Present 只改变该 Located
Occurrence 的 surface、空间、局部层和入退场；它不重启其 source-time mapping。
同一个 Material 被多个 Item 引用仍表示多次独立使用，fan-out 不复制素材。

A-roll 与 B-roll 都可以降低为媒体 surface，但并不因此成为同一种业务对象：
A-roll 的 source 可以是 Speech Spine 的同步 Visual Facet；`broll-track` 则
可以定义多 item 序列、组合后转场、声音和自己的动态端口组。`Item` 是 Track
拥有的作者单元，不是编译器预设的 `broll` 领域模型。

### 6.3 统一 TemporalPlacement、求交与层叠

Item 与 Present 平等使用同一种时间放置合同：

```text
TemporalPlacement {
  locator: SelectionSet | MomentSet | ProgramSpan | FullProgram
  projection: identity | WindowProjection
}
```

`during=` 接闭合的 SelectionSet 或手工 ProgramSpan；`at=` 接完整的 MomentSet。
Moment 消费者若需要持续窗口，必须由有限的素材原生时长、Kernel/SVS 相对时长
或显式相对 WindowProjection 得到，不能再拼接另一个未声明端点。`window`
可以相对具名 range/moment，也可以直接给出基于 Program 起点或终点的手工窗口：

```svml
during={script.selection.promise}  <!-- 语义窗口，优先 -->
during="0s .. 3s"                  <!-- 全片开头三秒，合法 -->
during="end-2s .. end"             <!-- 全片最后两秒，合法 -->
window="start-200ms .. end"        <!-- 相对已有窗口的局部投影 -->
```

基于语义的 Selection/Moment 是 SVML 最有价值、最可迁移的定位方式，但不是
强制宗教。标题前三秒、片尾箭头、固定片头等需求本来就属于 Program 时间；
作者完全不引用 Selection/Moment 也合法。工具可以对大量手工秒数给出
portability lint，但不能禁止。所有语义与手工时间最后都量化到同一个 Base
Clock 的整数边界，不存在第二条“手工时间线”。

以使用 `each` 的媒体 Item 为例，每个 occurrence 独立执行：

```text
Bₖ = ResolveOccurrence(item.locator, k)
Wₖ = Project(Bₖ, item.projection)
Mₖ = BuildSourceTimeMapping(item.source, Wₖ, item.playback)

Bₖᵢ = ResolveOccurrence(presentᵢ.locator, matching-policy)
Vₖᵢ = Project(Bₖᵢ, presentᵢ.projection)
Eₖᵢ = Wₖ ∩ Vₖᵢ
```

`Eₖᵢ` 是 Present 的实际 surface window。在任意 `t ∈ Eₖᵢ`，同一 Located
Occurrence 的所有 Present 都从同一个 `Mₖ(t)` 采样；求交、裁切、样式切换和
局部重叠均不得重置素材时间。一个 Present 超出父窗口的部分正常裁掉；某个
occurrence 求交为空则省略并产生诊断，整个 Present 均为空时报告 unused
presentation。

Present 可以重叠，语义是同时绘制多个共享 `M(t)` 的 surface，而不是按源码
顺序或 CSS specificity 猜覆盖关系：

- 不重叠时不要求显式 layer；
- 重叠且 local layer 不同时，按 layer 合成；
- 重叠且 local layer 相同时，以 `presentation_layer_ambiguous` 失败；
- local layer 只在父 Item 内排序，不代替 Track 的全局 z；
- 需要属性组合而非双 surface 时，应在一个 Present 上组合 SVS class。

Item 的基础 presentation 是默认值和 fallback。没有活跃 Present 时渲染一份
基础 surface；有活跃 Present 时，每个 surface 继承基础参数后再应用自身 class
和属性。时间使用方式如 `sync`、`native`、`hold`、`loop`、`stretch` 只属于
Item；空间采样如 `contain`、`cover`、focal point 可由 Item 提供默认值并由
Present 覆盖。

相邻 Present 若要硬切，可让前一个 close 右吸、后一个 open 也右吸：

```svml
@/left~ @right Word
```

二者复用同一个语义 Anchor 和同一次帧量化，得到 `[start, F)` 与 `[F, end)`。
若要交叠淡化，可让后一个 Present 的相对 Projection 比语义起点提前，例如
`window="start-200ms .. end"`；重叠 surface 仍共享 `M(t)`，不会跳帧或重播。

### 6.4 确定性空间与全局 z

Locate v1 不只确定时间，也必须把 Track projector 需要的空间输入降为明确值。
公共 ABI 至少需要这些确定性空间形状：

```text
SpatialPlacement
= canvas | named-region | fixed-box | inset/alignment
+ transform | crop/fill | mask/radius | opacity
```

它们可以来自 Kernel 默认、SVS class 或实例属性，也可以包含作者显式声明的
确定性关键帧；最终进入 Located props 的是画布坐标、尺寸、裁切和变换，而不是
让 renderer 临时猜布局。

SVML v1、stdlib 和验收用例明确不实现 VLM、bbox、subject selector、人脸跟踪、
pose/keypoint 或“看完整视频后再决定空间”。这些能力若未来值得做，可以作为
导入的扩展 Kernel、evidence provider 或对已编译 HyperFrames HTML 的后处理器；
它们不能反过来改变 Script、Speech Spine 或基于语义时间戳的免剪辑定位原则。

每条有视觉输出的 Track 必须拥有 **全片绝对 z**。Film 的全局视觉栈按
`(z, stableTrackIdentity)` 确定性排序，不按 Film 子元素顺序、Canvas y 坐标或
创建先后猜测。由此 B-roll 可以位于 A-roll 下方，而 A-roll 的圆形画中画可以
在同一时刻盖到 B-roll 上方。一个 Track 在同一 Film 中最多引用一次；重复引用
是 `duplicate_track_in_film`，不能靠复制 Track 制造层级。

Track 内部仍可用 local layer 表达同一 Item 的重叠 Present，B-roll projector
也可维护自己的局部合成顺序；local layer 永远不能越过 Track 的全局 z。

### 6.5 Track projector、B-roll 组合与音频

Track 不是一条只能放单个 DOM 节点的薄容器，而是一个确定性 projector。它可以
一次读取本 Track 的全部 Located items，再输出同步的视觉和音频 fragment：

```text
Located Track
  ├─ visual projection → HyperFrames visual subtree
  └─ audio projection  → HyperFrames audio subtree
```

`broll-track` 因而可以先把多项素材组成内部 sequence，再在相邻 item 之间应用
`crossfade`、`push`、`wipe`、`cover`、`page-turn` 等交叉转场，同时输出
`composite_below` 等自身需要的视觉协议。`composite_below` 在 projector 阶段
绑定为该 surface 的绝对 z 以下已经累计的视觉栈，不是一个写死的“Base Track”。
转场只改变两个 Located items 的局部重叠与采样，不改变 Speech Spine、Program
Clock 或全局 z。`duration="200ms"` 这类数值是已定位 item 之间的局部转场参数，
不是替代 Selection 的全片定位。

视觉转场绝不隐式改变音频。B-roll Track 可以显式输出视频原声、gain/fade 和
转场音效，无需额外复制 Audio Track；如果作者没有声明音频行为，`crossfade`
只 crossfade 两个 visual surfaces。

Film projector 汇总：

```text
Visual Surface Tree = all Track visual fragments sorted by global z
Audio Tree          = Speech Spine primary audio
                    + Track audio contributions
                    + optional independent audio tracks
HyperFrames HTML    = one document containing both trees and the Base Clock
```

Audio Tree 必须显式保存 source、ProgramRange、gain、bus/duck 以及重叠混合规则；
不能因某个声音没有独立 Canvas 节点就丢失。Visual Surface Tree 和 Audio Tree
都是编译器内部 lowering，不要求作者在 `.svml` 中手写两棵树。

### 6.6 完整示意

下面示例中，A-roll 是一个 50 秒视频，第一处 speech token 在对齐后可以落到
第 10 秒；`demo` 仍由 Segment 的两个结构切点覆盖完整媒体区间。前 10 秒没有
词法锚点，但 Present 可以相对 `demo` 起点每两秒换位，并用 200ms overlap
消除硬闪。B-roll 在全局 `z=100`，A-roll 在 `z=200`，所以 A-roll 画中画能
盖在 B-roll 上方；标题和片尾箭头演示合法的手工 ProgramSpan。B-roll 原声和
转场音效由 B-roll Track 自己进入 Audio Tree。具体标签和属性表面仍需 parser
原型验证，本例冻结的是数据合同。

```svml
<svml version="1">

  <import from="./kernels/speech-spine.svk"/>
  <import from="./kernels/media-track.svk"/>
  <import from="./kernels/broll-track.svk"/>
  <import from="./kernels/text-track.svk"/>
  <import from="./kernels/caption-track.svk"/>
  <import from="./kernels/film.svk"/>

  <import as="house"   from="./house.svs"/>
  <import as="content" from="./launch.svc"/>

  <script>
    @demo

    <segment id="main">
      <A> @promise Video creation is about to change.
          @/promise~ @reveal Meet Hypit, the semantic way to make video.
          @/reveal
    </segment>

    @/demo
  </script>

  <speech-spine id="speech">
    <segment
      id="main"
      script={script.segment.main}
      source={content.long-aroll.video}
    />
  </speech-spine>

  <media-track id="aroll" z="200">
    <item
      id="host"
      source={speech.segment.main.visual}
      during={script.selection.demo}
      playback="sync"
      class="house.host-base"
    >
      <present
        id="lead-top-left"
        during={script.selection.demo}
        window="start+0s .. start+2.2s"
        layer="10"
        class="house.face-top-left"
        exit="fade 200ms"
      />
      <present
        id="lead-top-right"
        during={script.selection.demo}
        window="start+2s .. start+4.2s"
        layer="20"
        class="house.face-top-right"
        enter="fade 200ms"
        exit="fade 200ms"
      />
      <present
        id="lead-bottom-right"
        during={script.selection.demo}
        window="start+4s .. start+6.2s"
        layer="30"
        class="house.face-bottom-right"
        enter="fade 200ms"
        exit="fade 200ms"
      />
      <present
        id="lead-bottom-left"
        during={script.selection.demo}
        window="start+6s .. start+8.2s"
        layer="40"
        class="house.face-bottom-left"
        enter="fade 200ms"
        exit="fade 200ms"
      />
      <present
        id="lead-center"
        during={script.selection.demo}
        window="start+8s .. start+10.2s"
        layer="50"
        class="house.face-center"
        enter="fade 200ms"
        exit="fade 200ms"
      />

      <present
        id="promise"
        during={script.selection.promise}
        layer="60"
        class="house.lower-split"
        exit="fade 200ms"
      />
      <present
        id="reveal"
        during={script.selection.reveal}
        window="start-200ms .. end"
        layer="70"
        class="house.corner-circle"
        enter="fade 200ms"
      />
    </item>
  </media-track>

  <broll-track id="broll" z="100" composite="below">
    <item
      id="poster"
      source={content.poster.image}
      during={script.selection.promise}
      playback="hold"
      class="house.full-frame"
    />
    <item
      id="product-demo"
      source={content.product-demo.video}
      during={script.selection.reveal}
      playback="stretch"
      audio="source"
      class="house.full-frame"
    />
    <transition
      from="poster"
      to="product-demo"
      kind="crossfade"
      duration="200ms"
      sound={content.whoosh.audio}
    />
  </broll-track>

  <text-track id="manual-overlays" z="250">
    <item id="opening-title" during="0s .. 3s" class="house.title">
      The semantic video era starts now.
    </item>
    <item id="ending-arrow" during="end-2s .. end" class="house.arrow">
      ↓
    </item>
  </text-track>

  <caption-track
    id="captions"
    z="300"
    class="house.launch"
    script={script}
  />

  <film
    id="main"
    class="house.vertical"
    spine={speech.spine}
  >
    <track ref={broll.track}/>
    <track ref={aroll.track}/>
    <track ref={manual-overlays.track}/>
    <track ref={captions.track}/>
  </film>

</svml>
```

Film 内 `<track>` 的书写顺序在这里仅为排版，不决定层叠。若
`script.selection.emphasis` 含多个非连通 occurrence，声明为 `set` 的 Caption
端口会一次得到整个集合；声明为 `each` 的媒体端口会为每个 occurrence 建立
独立 Located Occurrence；声明为 `one` 的端口则必须明确报 cardinality error。

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

## 8. 编译、诊断与版本纪律

### 8.1 确定性编译相

任何 Capability Host 或 projector 被调用之前，source closure 必须完整经过：

```text
parse → bind → typecheck → expand → plan
```

这些阶段都是确定性、只读的，失败时不得留下 provider 调用、缓存选择或部分
运行状态。SVML 对外区分三个逐级更完整的编译结果，而不是把所有东西都叫
“跑图”：

```text
Plan Compile
  source closure → typed Plan IR → Canvas/DAG view

Estimate Compile
  Plan + syllable/segment estimates → estimated Base Clock/Anchor Map
  → Estimate Timeline

Located HTML Compile
  Plan + materialized media + required Speech Compile evidence
  → Located IR → Track projectors → HyperFrames Document AST
  → HyperFrames HTML
```

对于有口播的一条完整 Film，Located HTML Compile 必须经过唯一的 Speech
Compile protocol，缺一不可：

```text
1. Speech Spine materialization
   生成/读取各 Segment 媒体，统一采样与顺序，组装 primary speech audio，
   建立结构性的 Base Clock 与 Segment ProgramRanges

2. WhisperX alignment
   对统一口播音轨得到测量后的词级时间与置信证据

3. Narrative Planner
   一次结构化处理完成改词/显示词校正、Cue 切分和所需字段标注，
   再由确定性 binder 生成最终 Anchor Map
```

这里的三步是影片编译协议，不是 `.svml` 作者需要手写的三类节点，也不是
generation/analysis/render 的重跑标签。没有词汇内容的纯静音 Film 可以显式走
non-lexical profile，跳过 WhisperX 与 Narrative Planner，但仍必须有结构性的
Base Clock。Estimate Timeline 可以在实测 evidence 之前供人预览；它不能冒充
最终 Located HTML。

Speech Compile 完成后，所有 Selection、Moment 和手工 ProgramSpan 都投影到
同一个 Base Clock；Track projector 随后只消费 Located props。VLM/bbox 不在
这条 v1 编译链中。

成功的 Plan IR 至少可以打印：

- 唯一 Film root、从它可达的全部 Kernel 调用、输入输出端口和 DAG 边；
- 每个 execution instance 的稳定 identity、execution digest，以及未进入执行
  子图的声明清单；
- 每个 effective parameter 的值、来源和覆盖链；
- 完整 import DAG、规范来源、内容哈希和实际使用的 Kernel 实现；
- Script 的 Estimate Anchor Map、预览时间线及仍需 Evidence 才能解析的部分；
- 所有运行时能力请求及其类型化输入，但不把“是否重跑”写回源码。

每条诊断至少包含稳定错误码、主源码范围、必要的相关范围、具体失败事实和一个
可执行修法。生成源码、import 展开和 Kernel expansion 必须保留 source map，
使错误回到作者实际编辑的文件，而不是只指向展开后的 IR。

### 8.2 CST、格式化与迁移

Parser 除语义 AST 外还要保留足以安全改写的 CST：注释、布局空白、属性顺序和
原始源码范围不能在一次无关编辑中丢失。规范 formatter 必须满足：

```text
parse(format(source)).semanticIR == parse(source).semanticIR
```

语言迁移和自动修复在 AST/CST 上执行，不做全文件字符串替换。一个公开构造被
移除前必须先经历可诊断的弃用期；能机械改写时，诊断应携带精确 fix，未来可由
`svml fix` 应用。未知主版本和无法证明安全的半迁移必须 fail closed。

### 8.3 版本与可复现性

以下版本彼此独立，不因其中一个升级就强迫其他层同步改号：

| 版本 | 负责 |
|---|---|
| SVML document version | 外层源语言与模块表面 |
| Script Surface version | 已冻结的稿子语法和 Narrative IR |
| SVK/package version | 某个 Kernel 的公开合同与实现 |
| Plan/Located IR schema version | 编译器内部和工具消费合同 |
| HyperFrames target version | 最终渲染目标合同 |

下游 IR 或 HyperFrames 升级时，只要作者意图仍可无损表达，就由编译器 emitter
适配，不要求所有 `.svml` 迁移。一次可复现的冻结编译必须记录编译器版本、
语言与 Script Surface 版本、全部解析后 import 的来源与内容哈希、Kernel
实现、effective parameters 和目标 schema 版本。

`svml.lock` 是 source closure 的必需生成物，不再留作以后决定。它至少固定：

- 每个传递 import 的 canonical URI、精确版本、内容哈希和完整依赖边；
- Kernel manifest、实现哈希、ABI/profile 和声明权限；
- 编译器兼容范围与 HyperFrames target；
- 解析 registry/Git/URL 后真正使用的不可变 artifact。

作者通常不手写锁文件，但可执行、可复现的冻结编译必须携带它；只有源码而没有
可解析锁文件时可以做编辑与诊断，不能宣称可复现构建。Pin、take、缓存、任务和
运行状态仍不进入 `.svml` 或 `svml.lock`；它们属于另一个运行状态/lock record。

## 9. 当前需要原型验证的部分

在冻结完整文档格式前，至少验证：

1. `gpt-image`、`seedance-speaker`、异构输入与多输出媒体 Kernel、
   `ranking-tier-list`、`speech-spine`、`media-track`、`broll-track`、
   `caption-track` 和 `film` 都能只用公开 SVK 清单定义，编译器不按 tag 名写
   特殊业务分支；
2. `.svc` 中的多级生成和 fan-out 能完整进入 Plan IR，不可达调用不触发运行时，
   且 `.svc` 不能藏匿名可执行渲染片段；
3. Script-dependent A-roll 留在 `.svml` 后，Plan/Estimate/Speech Compile/
   Locate 的数据依赖没有隐式边；
4. `.svs` 按 Kernel default → classes → instance 的固定顺序解析，且每个结果
   都能解释来源而不引入 cost/rebuild 语义；
5. 统一 import 与 `svml.lock` 能处理别名、同名冲突、环、精确实现、权限和
   transitive provenance，并能离线复现同一 source closure；
6. Seedance 与 Ranking 变体作为平级 Kernel 时，共享运行时代码无需进入语言，
   并且不需要 family/mode conformance；
7. static expand、capability lowering 和 track projection 的 ABI 能实际隔离
   provider 凭证、全局 DOM/CSS、网络、墙钟和随机性；组件 root 不被误当成
   JavaScript 安全边界；
8. formatter、source map、一次弃用迁移与 document/SVK/IR 版本独立性通过
   golden fixtures；
9. 只做格式化、移动声明或重排 import 时，instance identity 保持不变；参数或
   传递输入变化时 execution digest 改变；Pin 复用旧 artifact 时下游摘要使用
   实际 artifact hash；
10. 同一个非连通 SelectionSet 分别进入 `set` Caption、`each` media 和 `one`
    consumer，得到完整集合、稳定多实例和明确 cardinality error，而不是隐式
    取第一段；
11. Speech Spine → WhisperX → Narrative Planner 三步完成后才产出有口播 Film
    的最终 Anchor Map；Track/Present 不能反向决定 Spine 时间；
12. Selection、Moment、`0s .. 3s`、`end-2s .. end` 和相对 WindowProjection
    都进入同一个 Base Clock；手工 ProgramSpan 合法但不成为第二条时间线；
13. 同一 Located Occurrence 的多个 Present 共享一个 source-time mapping；
    硬切复用同一 Frame Boundary，overlap 按显式 local layer 合成且不重启媒体；
14. fixed-box、named-region、crop/mask 等确定性空间合同能完整进入 Located
    props；v1 fixtures 不依赖 VLM、bbox、subject tracking 或像素反向定位；
15. B-roll 多 item 组合、`composite_below`、交叉转场、视频原声和转场音效能由
    一个 Track projector 同时贡献 Visual/Audio fragment，不生成
    `audioCueIntent`；
16. Film 按全局 z 而非子元素顺序绘制；A-roll 画中画可盖在 B-roll 上方，重复
    Track 引用 fail closed；
17. Canvas/DAG、Estimate Timeline、Located Timeline 都只消费 IR；Visual
    Surface Tree 和 Audio Tree 只是私有 HyperFrames lowering；唯一正式最终
    编译目标是 HyperFrames HTML。
