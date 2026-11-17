# NLE 后端能力审计

> 状态：当前 NLE 产品能力、所有者事实、Host API 与执行能力的实现审计。

## 目的

这份审计把 NLE 工作台的产品验收能力映射到当前 Hypit 权威边界。它回答四个问题：

1. 哪个 Owner 保存这项能力的作者事实；
2. 它应当表现为 Observation、Command、Operation、Action 还是 Interaction；
3. 当前代码已经闭合到哪一层；
4. 下一项实现应补 Owner fact、产品 planner、Executor，还是仅补 transport projection。

产品能力不能直接展开成一组互不相关的 HTTP 路由。浏览器、Desktop、Agent 和 CLI 应调用同一组类型化
Host 契约；HTTP 只是其中一个 Adapter。

本次取证以 `packages/application`、`packages/project`、`packages/media-asset`、`packages/media-local`、
`packages/nle` 和 `packages/nle-studio` 的当前实现为准，并以 System Constitution、Project Host、NLE、
NLE Editing Surface 与 NLE Studio 的 Owner 设计解释其边界。产品清单只提供验收意图，不替代这些权威。

## 审计状态

| 状态 | 含义 |
| --- | --- |
| **已具备** | 当前事实、Service 或 Action，以及至少一条实际调用路径已经成立 |
| **产品缺口** | Owner fact 和底层命令存在，但缺少 Product Session 的语义 planner、有限投影或 receipt |
| **执行缺口** | 作者事实足以提出请求，但尚无可观察、可取消并持有结果的 Executor Action |
| **事实缺口** | 当前 Owner 文档无法持久表达该能力，必须先建立领域事实 |

“已具备”不表示所有交互已经完善。“产品缺口”也不表示浏览器完全无法操作；它常常意味着当前浏览器在
自行组织底层命令，而权威规划尚未回到后端。

## 当前运行切面

```text
ApplicationHost
├─ ProjectHost
│  ├─ Project Media Service
│  ├─ Package Environment
│  ├─ Project Resource Gateway
│  └─ Owner document registry
├─ NLE Studio Product Session
│  ├─ NLE Project Service
│  ├─ NLE View Service
│  ├─ NLE Editing Surface
│  └─ package contributions
└─ AIGC Execution Directory
   └─ selected project Capability Invocation clients
```

当前 ApplicationHost、ProjectHost、Product Session 注册和 Session 路由已经成立。NLE Studio 当前公开有限
`observe(request)`、compact mutation receipt、通用 Surface command、若干物化方法、保存、重载和资源读取。
`open` 只包含首屏有限投影；Timeline observation 显式投影 Composition 导航、关系、信号存在性和 Product
后端解析的 Item-to-Media identity。主要缺口是：

- `operate(operation)` 已承接 Timeline drop、Media/Component/Adjust/Transition/Composition 物化和音频分离；
- AIGC Execution Directory 已能注册 Provider/model Environment 并打开 Project client；影音与 Media Action
  由 Product/owner Service 投影各自注入的 specialized Executor。

## 总览

| 产品能力 | 当前主要所有者 | 审计结论 |
| --- | --- | --- |
| 文件和媒体显示 | Project Media Service、Media Executor | 接受、目录和资源读取已有；派生视图与试听缺执行 |
| 轨道和拖放 | NLE Project、NLE View、NLE Studio planner | 底层事务已有；最终落点规划缺产品后端 |
| 插入和磁吸 | NLE Project、产品编辑策略 | ripple 基础已有；插入、闭合和连续主轨 planner 不完整 |
| 片段剪辑和关联 | NLE Project、NLE View | trim、split、move、detach 基础已有；联动范围仍需产品 planner |
| 复制和复合片段 | Product Session clipboard、NLE Composition | 同一文档内 clipboard、单轨 compound/explode、独立副本和 Session 导航已具备 |
| 画面和动画 | NLE Picture layout、package Operator | frame、fit、focus 已有；其余画面处理和关键帧由 package value 表达，缺标准 package 与产品操作 |
| 变速和定格 | NLE source time、Reconstruction | 精确时间映射和定格表达已有；缺产品 planner 与标准 Audio Reconstruction |
| 转场 | NLE Transition、package Operator | 关系、物化和降低已有；编辑维护 planner 不完整 |
| 滤镜 | Present Process、Adjust、package Operator | 核心事实完整度高；片段效果 catalog 与产品操作不完整 |
| 文字和字幕 | package Component、Shared Value、NLE materialization | 标量与稳定 collection Inspector、字幕内部时间、共享样式编辑及 Component Media 绑定已有；字幕导入缺失 |
| 声音 | NLE Audio Process、Reconstruction | 表达基础已有；缺标准处理 package、产品操作和执行路径 |
| 播放和导出 | Audiovisual Executor | 单帧、有限音画播放区间、导出与统一 Action 观察已具备 |
| 保存和撤销 | NLE Project/View Services、Owner Providers | revision、事务、历史、显式保存、compact receipt 与变化事件已具备 |

## 1. 文件和媒体显示

| 能力 | 形态与所有者 | 当前证据 | 状态与缺口 |
| --- | --- | --- | --- |
| 接受视频、音频和图片 | Adoption Action；Project Media Service | Node Media adoption 检查容器、写入 Media Asset、刷新 Catalog；Studio 提供文件上传 Adapter | **已具备**。本地类型策略当前覆盖常见视频、图片和音频扩展名 |
| 接受字幕源 | Caption materialization input；字幕包或明确的字幕来源 Owner | 当前 Media 类型策略不接受 SRT，NLE 也没有字幕来源事实 | **事实缺口**。应先决定字幕源是一次性物化输入还是持久 Owner 文档 |
| 目录元数据与失败诊断 | Observation；Project Media Service | Catalog 暴露引用、媒体类型、时长、画面尺寸、旋转、音频存在性及 available/missing/invalid | **已具备** |
| 多个 Item 复用同一素材 | NLE occurrence；NLE Project | 多个 Media Present 保存同一便携 Media Asset 引用，trim、retime 和 Process 属于 occurrence | **已具备** |
| 缺失素材保持作者结构 | Media observation + NLE reference | Catalog 可报告 missing；NLE Reader 不依赖打开媒体即可保留 Item 时间与引用 | **已具备**。面向当前打开文档的受影响 Item 投影仍需补充 |
| 移除 Project Media | Project Media Service Action | 当前 Service 没有删除操作，也不维护跨 Owner 反向引用 | **产品缺口**。若增加移除，调用者必须显式给出作用边界并由相关 Owner 校验引用 |
| 原媒体按需读取 | Project resource capability | Project Resource Gateway 与 Studio resource route 支持 capability token 和 byte range | **已具备**，但只是资源读取，不等于解码后的逐帧/同步播放 |
| 缩略图与 storyboard | Media Action | 以当前 Catalog generation、Media 时钟位置或范围取所选流；storyboard 提供样本到 atlas tile 的映射 | **已具备**后端；Timeline 可见 Item 范围尚未接入 |
| 波形 | Media/NLE Action | 从所选 Media Audio member 生成峰值 PNG；处理后波形消费当前 AVIR Programme | **已具备**原始波形；处理后波形缺失 |
| 音频试听 | Media/NLE playback Action | 素材可输出指定 Media 区间的 WAV；NLE 播放区间可包含混合音频 | **已具备**素材与节目试听；独立 occurrence 试听范围待定 |

## 2. 轨道和拖放

| 能力 | 形态与所有者 | 当前证据 | 状态与缺口 |
| --- | --- | --- | --- |
| Item 移动与换轨 | Product Operation -> NLE transaction | `timeline.drop` 依据锚点、落点和选区统一计算精确 delta 和逐 Item destination | **已具备** |
| 空白区域补轨 | Product Operation -> `track.add` + `item.move` | 后端生成身份与轨道顺序，新增 Track 和移动 Item 作为一次 NLE 事务提交 | **已具备** |
| 兼容轨道与锁 | NLE Studio planner + NLE View guard | 后端跳过锁定及异类目标，并拒绝从锁定源轨道移动 | **已具备** |
| 落点冲突分配 | NLE Studio planner | 按 Studio 交互策略为新 Picture Present 冲突寻找邻轨或补轨，保留已移动成员间的画面关系和 Audio mix | **已具备** |
| 多选保持相对布局 | NLE Studio planner | 同源轨道成员作为一个批次；View Group、Transition 和 Matte 端点闭包共享时间位移，保留轨道相对显示顺序 | **已具备** |
| 默认时长 | Materialization planner | Studio 采用 Interpretation 或 offering 的 duration，常量媒体采用 View 帧网格上的五秒默认时长 | **已具备** |
| Track 层级排序 | NLE Command | `track.move` 修改 Composition 中 Track 顺序；lowering 按 Picture Track 后到前组合 | **已具备**，当前浏览器直接发底层命令 |
| Track 类型兼容 | NLE fact + product planner | 拖动沿用源轨道的输出域，物化使用各 offering 或 Media 的输出域 | **已具备** |
| Track 锁定 | NLE View Command | `track-lock.set` 与 Surface guard 已实现 | **已具备**，但多成员 Operation 必须在后端一次检查所有触达 Track |
| Track 启用与音频静音 | NLE Project Command | `track.update.enabled` 参与 lowering | **已具备**。当前是领域统一的 Track enablement，而非额外静音状态 |

## 3. 插入和磁吸

| 能力 | 形态与所有者 | 当前证据 | 状态与缺口 |
| --- | --- | --- | --- |
| 在播放头插入并后移范围 | NLE Studio Operation | `item.move`、`track.add` 和物化 planners 可组成一个原子事务 | **产品缺口**。缺少明确插入 scope、轨道选择和失败 receipt |
| 关联成员随插入移动 | NLE Studio planner | Present 可协调 Picture/Audio；View Group 和 Nested Composition 分别表达编辑关系与内容关系 | **产品缺口**。planner 必须显式闭包所触达成员并统一检查锁与冲突 |
| 连续主轨和自动磁吸 | Product Session policy | 当前产品 planner 没有稳定的主轨选择、插入和闭合策略 | **产品缺口**。只有用户明确保存一种编辑安排时才进入 View，不进入视听 Project |
| 关闭空隙 | NLE Studio Operation | `timeline.close-gap` 从播放头及指定 Tracks 求精确空隙边，整体位移后段，并守卫关系范围 | **已具备**单个显式空隙 |

## 4. 片段剪辑和关联

| 能力 | 形态与所有者 | 当前证据 | 状态与缺口 |
| --- | --- | --- | --- |
| move、trim、slip、roll、ripple trim | NLE Commands | 精确 source-time slicing、shift 与 Project 校验已经实现 | **已具备**底层语义；复杂 scope 和用户意图仍需 Product Operation |
| split | NLE Studio Operation + NLE Command | `timeline.split` 对选区内跨越播放头的 Items 一次提交，各自切分 source/control time | **已具备** |
| 删除播放头一侧 | NLE Studio Operation | `timeline.trim` 按精确帧位置修改指定 edge | **已具备** |
| 删除并保留空隙 | NLE Studio Operation + NLE Command | `timeline.remove` 原子删除显式选区及关联 Transition/Matte，保留其它 Item 的时间 | **已具备** |
| 删除并闭合空隙 | NLE Studio Operation | `timeline.ripple-remove` 删除连续选区，在显式 Tracks 内整体移动后段 | **已具备**显式范围 |
| Picture/Audio 协调编辑 | NLE Present | 一个 Present 可同时拥有 Picture 与 Audio appearance，共享 occurrence 时间和 source-time | **已具备** |
| 分离音频 | NLE Studio Operation + NLE Command | `audio.detach` 分配目标轨后，和 `item.detach-audio` 一起原子提交 | **已具备** |
| 编辑分组 | NLE View | View Group 持久表达同一 Composition 内的 linked-edit 意图；Timeline drop 在后端展开成员 | **已具备**分组移动，其他组合操作需各自确定作用范围 |

## 5. 复制和复合片段

| 能力 | 形态与所有者 | 当前证据 | 状态与缺口 |
| --- | --- | --- | --- |
| 复制、剪切和粘贴 | Product Session clipboard + NLE Studio Operation | Session 保存选区；粘贴重建身份、精确时间和轨道分配 | **已具备**同一 NLE 文档内 |
| 复制 Transition、Matte 和 Group | NLE Studio paste planner | 完整端点的 Transition/Matte 与 Project 一起粘贴；完整 Group 由一次显式 View 操作恢复 | **已具备** |
| 建立复合片段 | NLE Composition + Operation | `composition.compound` 把单轨连续 Present 和完整关系移动到 child，在原画面层级留下父 occurrence | **已具备**单轨路径 |
| 进入与返回复合片段 | NLE View + Product Session interaction | enter/return 修改 active View，返回时恢复 Session 保存的父播放头位置 | **已具备** |
| 复合片段独立副本 | NLE Studio Operation | make-unique 深复制本地定义关系并重绑当前 occurrence；保留显式 Project Media 和 Shared Value 引用 | **已具备** |
| 外层移动、裁剪和变速 | Composition Present | occurrence 拥有独立 placement 与 source-time；Nested lowering 已实现 | **已具备**底层语义 |
| 解除复合 | NLE Studio Operation | explode 将单轨、全长、无额外时空变换或处理的 child 内容提升到原 parent 位置 | **已具备**可无歧义提升的路径 |

## 6. 画面和动画

| 能力 | 形态与所有者 | 当前证据 | 状态与缺口 |
| --- | --- | --- | --- |
| 位置和画框尺寸 | NLE Picture layout | layout 保存 x、y、width、height；Canvas 与 Inspector 有有限投影和 guarded spatial edit | **已具备** |
| fit 与内容焦点 | NLE Picture layout | fit、contentX、contentY 已持久化并参与 lowering | **已具备** |
| 旋转、透明度、镜像、单轴内容缩放 | Picture Process + package Operator | Jensen 的 Transform 和 Filter offering 提供旋转、单轴正向缩放和透明度的 Inspector | **已具备**旋转、缩放、透明度；镜像操作仍缺 |
| 源画面裁剪 | Picture Process + package Operator | source crop 可由 Picture Operator 的 package value 表达 | **产品缺口**。需要标准 Crop/Transform package 与 Canvas 操作 |
| 画面属性关键帧 | package Operator parameters | Jensen 的 Transform 和 Filter 通过 Inspector 编辑已有关键帧的值与插值方式 | **已具备**已有点值与插值；新增、移动和移除点仍缺 |
| 关键帧移动、冲突和剪辑跟随 | package authoring + Process Control time | Process 的 local Control relation 会随 split、trim 和 roll 切片、重定时 | **产品缺口**。package authoring 负责点级操作，NLE 负责 occurrence 时间关系 |

NLE 只拥有画面处理的放置、顺序、启用状态、Control time 和共享关系。具体属性、关键帧和插值由选中的
Operator package 拥有；产品通过 package authoring contribution 显示并编辑它们，不为每种效果扩展中央 schema。

## 7. 变速和定格

| 能力 | 形态与所有者 | 当前证据 | 状态与缺口 |
| --- | --- | --- | --- |
| 恒定速度、倒放和分段映射 | NLE source-time | Item 保存精确 target-to-source pieces；`item.retime` 可替换整条关系 | **已具备**底层表达；缺少产品级 speed planner 与有限 Inspector |
| 音画协调变速 | NLE Present | 同一 Present 的 Picture/Audio 共用 source-time | **已具备**底层表达 |
| 保持音调策略 | Audio Reconstruction | Audio appearance 已能保存 package Reconstruction 与 closed parameters | **产品缺口**。需要标准 preserve-pitch package、offering 与 Inspector |
| 定格 occurrence | Picture-only Present + source-time | 零速线性映射表达选定源时刻的 hold，Picture-only occurrence 不产生音频 | **产品缺口**。需要从当前帧物化 occurrence 的 planner |
| 变速重定时动画与音量点 | Process Control time + package parameters | occurrence 编辑已切片、重基 Process Control relation；点值仍由各 package 拥有 | **产品缺口**。需要 package 参数操作与产品级 speed planner 协同 |

## 8. 转场

| 能力 | 形态与所有者 | 当前证据 | 状态与缺口 |
| --- | --- | --- | --- |
| 添加 Transition | NLE relationship + package Operator | 显式 outgoing/incoming relation、canonical overlap、package parameters 和原子物化 planner 已实现 | **已具备**基础路径 |
| 从选区添加 Transition | NLE Studio Operation | 两个选中 Item 由后端按精确时间排序并校验直切关系 | **已具备** |
| 从播放头选择切点 | NLE Studio Operation | 多轨切点需要显式的轨道或目标选择 | **产品缺口** |
| 修改类型、参数和时长 | NLE Studio Operation | `transition.replace` 存在；package Inspector 尚未投影 Transition relation | **产品缺口** |
| 素材边界补帧 | source-time + Reconstruction + product policy | Project 已能选择 Reconstruction；Transition planner 可检查可用 source range | **产品缺口**。需要明确补帧 package/policy 与失败诊断 |
| move、trim、split 后维护关系 | NLE Studio planners | Project 最终校验会拒绝失效 relation，但不会替调用者重新计算或删除关系 | **产品缺口** |
| 删除 Transition | NLE Command | `transition.remove` 已实现 | **已具备**底层语义 |

## 9. 滤镜和效果

| 能力 | 形态与所有者 | 当前证据 | 状态与缺口 |
| --- | --- | --- | --- |
| occurrence-local 处理 | Present Process | Picture/Audio appearance、Reader、Serializer、validator 与 lowering 使用同一 `processes` 事实 | **已具备** |
| Programme-scope 处理 | Adjust Item | Adjust 是独立 Timeline Item，对同层以下累计信号生效 | **已具备**事实和求值 |
| 添加片段效果 | NLE Studio catalog + Operation | `hypit.nle-process` 物化到已有 Present 对应的信号处理链；Jensen 选择 Transform、Filter、Gain | **已具备** |
| 启用、停用、排序、删除 | Studio Operations + NLE Commands | 有限 Inspector 投影各信号处理链；操作寻址当前 Process 并检查 Project、View revision 和轨道锁 | **已具备** |
| 独立效果创建与长度编辑 | Adjust offering + Timeline edit | Adjust catalog/materialization 已实现；普通 move/trim 依赖 Operator `timeWindow` 声明 | **已具备**基础路径 |
| 参数编辑与共享 | package authoring + Inspector + Shared Value | Operator authoring、Inspector 和 Project-owned Operator Shared Value 已实现 | **已具备**基础路径 |
| 效果预览 | NLE Preview Action | 单帧和播放区间消费含 Process/Adjust 的同一 NLE Programme | **已具备** |

具体滤镜种类和数值范围由选中的 package Operator 声明，不进入 NLE 中央 schema。

## 10. 文字和字幕

| 能力 | 形态与所有者 | 当前证据 | 状态与缺口 |
| --- | --- | --- | --- |
| 从 catalog 创建文字或字幕 | Component offering + materialization | Studio 支持静态 parameters、duration 和 layout 的 Component offering | **已具备**最小路径 |
| 参数显示和编辑 | package Inspector + authoring contribution | Host 执行 package projector，浏览器只收到有限标量或稳定 row collection；编辑重新规划为 Project transaction | **已具备**有限结构化路径 |
| 时间线标题、文本和海报 | package Timeline presentation | Component 可贡献 title、tone、chrome、text layer 和资源 poster | **已具备** |
| Component Media inputs | Component occurrence + package declaration | Package 声明当前 slot 与信号要求，Studio 投影 Inspector、验证物化 seeds 并接受 bind/unbind；`ranking` 使用逐条目静态图片 slot | **已具备** |
| Component value ownership | NLE Project + package slot owner | inline/shared binding、Project registry、反向用户索引、同一 Inspector/reducer、ownership selector、share/link/unlink planner 与 Surface command 已实现 | **已具备**；创建 offering 尚不能原子 seed 或选择绑定 |
| 字幕逐词和内部时间 | caption Component parameters | `caption-fine` 以稳定 word/unit row collection 投影逐词内容和精确有理时间，并由 package reducer 替换闭合 parameters | **已具备** Jensen 编辑路径；在 package 证明切片语义前不开放通用 trim/split |
| SRT 导入和多轨分配 | Caption materialization Operation | 当前无 SRT parser、字幕物化 planner 或重叠条目分轨 Operation | **产品缺口**，并依赖字幕源边界决策 |
| 单条样式与共享样式 | inline Component value + Project Shared Value | 同一 package slot 可 inline 或 shared；Inspector 可选择本地或兼容共享值，unlink 复制解析值 inline，编辑分别守卫一个或全部用户 Track | **已具备**；命名新共享值的交互仍缺 |
| 预览和导出一致性 | package lowering + terminal programs | Frame Preview、Playback Preview 与导出使用同一 NLE terminal link 和 `HtmlProgram` ABI | **已具备** |

### 组件验收切片

三个 package 作为通用契约的验收切片，而不是三个专用后端：

| 验收 package | 必须证明的通用能力 |
| --- | --- |
| `text-fine` | Component offering、标量 Inspector、Picture layout、Timeline presentation、AVIR preview |
| `caption-fine` | 已证明稳定 word/unit collection、字幕内容与精确内部时间、inline/shared `style` 的同一 reducer 与 Project-wide 共享样式编辑；批量物化仍缺 |
| `ranking` | 已具备稳定 row/entry collection、条目级语义操作、初始物化、Media input 观察与绑定；package poster 与真实 preview 仍缺 |

这些切片下一步要求补充：

- offering 物化时受限的 Shared Value seeds；
- collection 行级 finite action；
- package poster 与真实 preview。

## 11. 声音

| 能力 | 形态与所有者 | 当前证据 | 状态与缺口 |
| --- | --- | --- | --- |
| Audio occurrence 与 reconstruction | NLE Audio appearance | Present 可有 Audio appearance，支持 package Signal Reconstruction 和 Audio Processes | **已具备**基础 |
| 片段增益 | Audio Process + package Operator | Jensen 选择 Gain offering，通过 Inspector 编辑倍数，播放与交付消费同一 AudioProgram | **已具备** Jensen 路径 |
| 淡入淡出 | Audio Process + package Operator | fade 是 Audio Operator 的时间化 closed value | **产品缺口**。需要标准 envelope package 与 Timeline 手势 |
| 音量包络与关键点 | package Operator parameters | Gain 投影已有线性关键点的精确时间和可编辑增益；NLE 保存其 Process 与 Control relation | **已具备**已有点的增益编辑；创建、移动和移除点仍缺 |
| Track 混音开关 | NLE Track | Track enabled 参与 lowering | **已具备** |
| 混合播放、导出与波形一致性 | AudioProgram / Media Actions | 播放与交付共享 `AudioProgram`；处理后波形 Action 仍缺 | **已具备**播放与交付 |

音量、淡化和包络可以成为官方标准 Audio Operator，但不因此成为 NLE 中央字段。NLE 产品可以为标准 package
提供一等手势；该手势仍通过 package authoring contribution 规划对 closed value 的替换。

## 12. 播放和导出

| 能力 | 形态与所有者 | 当前证据 | 状态与缺口 |
| --- | --- | --- | --- |
| 确定性 Programme 构造 | NLE lowering | accepted NLE snapshot 可降低为一个闭合 AVIR Programme，包括 Nested、Process、Adjust、Transition 和 Matte | **已具备** |
| 结构 Canvas | NLE projection | 无 Preview Executor 时可显示 Item frame 与直接 Media identification | **已具备**，它不是渲染结果 |
| 单帧预览 | HTML frame Action | Studio 以当前 revision 和 Composition 请求精确一帧并返回 PNG capability | **已具备** |
| 播放和 seek | HTML playback Action + Session transport | seek 请求单帧；播放请求有声 MP4 区间，结束后请求下一段 | **已具备**有限区间；区间接缝存在渲染等待 |
| 导出 | HTML video Delivery Action | Project 范围的 `NleDeliveryService` 已提供启动、观察、取消与资源交付，并调用注入的 `HtmlVideoExecutor`；Jensen Project 已完成生产路径 | **已具备**后端路径 |
| Action 恢复与结果生命周期 | Delivery Service + selected Executor | 当前 Service 保存打开进程内的 Action；跨进程重启恢复尚未实现 | **执行缺口** |

Preview 与 Export 消费同一 accepted Project revision、NLE-to-AVIR lowering 和 `HtmlProgram` frame ABI。输出
时钟、编码和任务恢复属于 Executor，不进入 NLE Project。

## 13. 保存和撤销

| 能力 | 形态与所有者 | 当前证据 | 状态与缺口 |
| --- | --- | --- | --- |
| Project 保存与重开 | Owner Provider + NLE Project Service | 显式 save、savepoint 与 reload 已实现；Media、Component、Process 和 Adjust 均经同一 SVML Reader/serializer 往返 | **已具备** |
| View 保存与重开 | Owner Provider + NLE View Service | JSON Reader/serializer、独立 revision/history/savepoint 已实现；无 View 文档时使用 session-only View | **已具备** |
| 原子用户编辑 | NLE transaction + Editing Surface | 一次 transaction 完整校验后提交；失败不改变 Service state | **已具备** |
| revision 冲突 | Owner Services | Project 与 View 分别检查 expected revision；Surface 对跨 Owner 依赖操作同时检查两者 | **已具备** |
| undo/redo | Owner Services | Project 与 View 有独立历史；新 transaction 清空对应 redo 分支 | **已具备** |
| Session 状态恢复 | Product Session | selection、playhead、zoom 和 pointer draft 当前在浏览器；不属于 Project/View undo | **产品缺口**仅限产品体验，不进入作者历史 |
| compact receipt | Product Session | Studio command、物化、Media import、save 和 reload 均返回 status、changed、invalidated 与有限 result；浏览器按 invalidation 重读有限 observation | **已具备** |
| change event | Application/Project/Product/Action event projection | Application lease/session、Project Media generation 与 document inventory、Studio owner invalidation 和 Delivery progress 均可订阅并经 loopback SSE 投影 | **已具备** |

Project 时间保持精确有理值。View 的 edit rate 定义工作台帧网格，Studio Operation 在边界把帧位置转换为精确
时间；持久文档不把 Programme 时间降格为某一界面的整数帧。

## 目标 API 族

以下 API 建立在当前 SVML、Project validator 与 lowering 对同一 NLE Project 事实的无损闭合上。

### Product Session

```ts
interface NleStudioProductSession {
  observe(request: NleStudioObservationRequest): Promise<NleStudioObservation>;
  command(command: NleEditingSurfaceCommand): Promise<NleStudioOperationReceipt>;
  operate(operation: NleStudioOperation): Promise<NleStudioOperationReceipt>;
  subscribe(listener: NleStudioEventListener): () => void;
  startAction(request: NleStudioActionRequest): Promise<NleStudioActionObservation>;
  observeAction(handle: string): NleStudioActionObservation;
  cancelAction(handle: string): NleStudioActionObservation;
  save(): Promise<NleStudioOperationReceipt>;
  reload(): Promise<NleStudioOperationReceipt>;
  resource(token: string): ProjectHostResourceResolution;
  close(): Promise<void>;
}
```

`command` 服务已经闭合的 Owner 命令。`operate` 服务需要根据当前 Project、View、Package 与 Session 上下文
规划事务的用户意图。浏览器可以保留 pointer draft，但不能决定最终轨道分配或事务边界。

### Observation

第一组有限 Observation 是：

- `open`：首屏所需 status、Timeline、Canvas、Media、Catalog 与 Preview 状态；
- `timeline`：当前 Composition 的有限 Timeline scene 与 affordances；
- `canvas`：NLE-owned Item frames；
- `inspector`：一个 Item、Process、关系或 Shared Value 的有限编辑表面；
- `media`：Project Media Catalog；
- `catalog`：Project manifest 选中的 author-facing offerings；
- `component-inputs`：一个 Component occurrence 的 Media slots 与当前绑定；
- `action`：一个 Action handle 的有限状态。

Observation 不向不可信前端发布完整 Project/View 文档、package 函数、绝对路径或 Executor 私有状态。

### Operation

当前事实已经足以支持的第一组产品 Operation 是：

- Timeline drop、insert、close-gap、move、trim、split、remove 与 paste；
- Media、Component、Process、Adjust、Transition 与 Composition materialization；
- Composition compound、duplicate 与 explode；
- Component Media bind/unbind；
- Component value share、link 与 unlink/make-unique；
- Inspector finite edit/action；
- Track add、move、enable 与 View lock/height；
- Group create/replace/remove；
- detach audio；
- caption import，在字幕物化输入边界确定之后。

每个 Operation 接受 expected Project/View revisions，重新读取当前 package declarations 与 View guards，生成
一个完整 owner transaction，再返回 revisions、结果地址和 invalidated projection names。

### Action

Product Session 或 owner Service 需要为自己调用的 specialized Executor 投影 Action contract：

- start；
- observe；
- subscribe；
- cancel；
- owner 明确承诺时的 reopen/recover；
- open completed resource。

第一组 Action kinds 是 Media thumbnail/storyboard/waveform/audio-preview，以及 NLE frame-preview、playback-preview
和 export。它们的 handle 分别属于 Media 或 NLE Product/Service。Provider/model Capability Invocation 的 handle
属于选中的 AIGC Execution Environment，并按该 Environment 的恢复契约长于 Product Session 和调用者连接。

### HTTP projection

NLE Studio 的 loopback Adapter 应投影少量稳定路由，而不是每个按钮一条业务路由：

```text
POST       /api/observe
POST       /api/command
POST       /api/operate
GET        /api/events
POST       /api/actions
GET        /api/actions/:handle
DELETE     /api/actions/:handle
GET|HEAD   /api/resources/:token
POST       /api/save
POST       /api/reload
```

影音和 Media Action 由发起它们的 Product 或 owner Service 投影，并由各自注入的 specialized Executor 持有；
只有 AIGC Capability Invocation 才由 ApplicationHost 的 Execution Directory 路由到选中的 Environment。

## 待讨论的产品策略

- 自动磁吸和连续主轨需要明确主轨归属、何时联动侧轨，以及锁轨冲突时的结果。
- 一次压缩多个不相交空隙需要明确各段的联动范围和处理顺序。当前单空隙操作使用调用者提供的 Tracks。
- 字幕源需要先确定引用和寿命，再开放导入和批量分轨。
- 跨 NLE 文档或 OS 剪贴板需要明确 Media、Shared Value 和 Composition 引用的导入与重绑边界。
- 多轨复合与任意解除复合需要明确跨轨混合、Adjust 作用域、外层处理和非线性时间关系如何转写为父级作者事实。
- 独立 occurrence 试听需明确是否包含所在 Track 的 Adjust、上层混音与 Reconstruction。

## 实现顺序

1. 完成其余已有事实可支持的 Timeline、Composition、Process 和 materialization Operations；
2. 补受限 Shared Value seeds 和 collection 行级有限操作；
3. 为 Timeline 按可见范围接入已有 Media 派生视图，并补 Programme 波形；
4. 建立标准 Picture Transform/Crop、Audio Gain/Envelope、preserve-pitch package，并开放对应 package authoring 与产品 Operations；完成 freeze 与 magnetic product planners；
5. 补完 `text-fine`、`caption-fine` 和 `ranking` 尚缺的物化、Media 绑定、poster 与真实 preview 验收。

## 闭合标准

一项能力只有同时满足以下条件才从审计中标记为“已具备”：

1. 当前 Owner 文档能持久保存全部必要作者事实；
2. Owner Reader 和 Service 能验证并原子接受它；
3. Product Session/owner Service 暴露有限 Observation 与语义 Operation/Action；AIGC Capability Invocation
   由选中的 Execution Environment 暴露；
4. View guards、revision 和 package selection 在提交时重新验证；
5. mutation 返回 compact receipt，事件只发布 invalidation 和当前地址；
6. Preview 与 Export 消费同一 accepted NLE meaning；
7. 浏览器无需解释完整作者文档、执行 package 代码或重建事务规划。
