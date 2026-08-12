---
title: Author Surface Binding
description: 已实现的编译器合同，覆盖受信任的包自有 Surface；第三方隔离尚未实现。
---

# Author Surface Binding

状态：已实现的编译器合同，覆盖受信任的包自有 Surface；第三方隔离尚未实现。

## 1. 目的

通用的 Markup Frontend 持有元素语法。包自有的 Surface 持有某个被 import 的标签*具体是什么意思*。SVS
只持有自己的样式表语法，并产出通用的不可变 Recipe record。Markup、SVS 和 Core 都不持有 Caption、Media、
Film 或其他任何包的属性词汇。

两者之间的桥是编译期引用检查：像 Caption 这样的 Surface 必须能够读取一个被显式引用的公开 Recipe，并在
Core 图构建之前把它下降为名义的 `CaptionProgram`。

本文定义这座桥，同时不引入全局 Recipe 注册表，也不引入 Runtime 步骤。

## 2. 有序的编译边界

一个 Source Closure 按以下顺序编译：

```text
recursive imported SourceUnits
  -> admitted public Records and symbolic component exports
  -> current document generic syntax
  -> package-owned Surface compilation
  -> typed authored Records + AuthorComponents + locked GraphFragments
  -> parser-independent Author linking
  -> Core CompiledGraph
```

因此，被 import 的 `.svs` SourceUnit 一定先于消费它的 `.svml` SourceUnit 完成编译。消费方的 Surface
拿到的是结构化的元素，以及一个只针对该元素中显式书写的引用的 resolver。

## 3. 引用解析结果

一个已解析的 Surface 引用包含：

```text
path       source spelling used by the element
ref        hygienic AuthorValueRef
type       exact nominal TypeRef
record?    defensively copied TypedRecord when the public export is already an authored Record
```

组件输出没有编译期 Record，因此省略 `record`。如果某个 Surface 需要检查值本身（例如 Recipe 解码器），它必须要求一份作者 Record，并在引用无法解析、Type 不对或此时还没有值时，于 `check` 阶段失败。

只有被 import 的 SourceUnit 的公开 record export 会被暴露出来。私有的子 record 不属于 resolver 的范围。每一份返回的 Record 都是防御性的规范化副本，因此 Surface 代码无法改写已经编译完成的子 SourceUnit 或此前的声明。

## 4. 包的归属

对于这段源码：

```svml
<caption-fine:Style recipe={studio.caption.dialogue}/>
```

各方职责如下：

```text
@narratage/svs
  parses studio.svs
  produces generic @narratage/svs#Recipe

@narratage/markup
  parses the element and the whole-value reference
  resolves only the public imported binding

@narratage/caption Surface
  requires @narratage/svs#Recipe
  validates Caption-owned properties
  emits nominal @narratage/caption#CaptionTrackProgram
  emits the AuthorComponent and locked GraphFragment

Author compiler
  resolves symbolic component dependencies and types

Core
  sees only typed Records, LogicalOutputs, Candidates and Operations
```

不存在一张通用属性表。另一个包完全可以通过另一个被显式 import 的 Surface 来解释同一份通用 Recipe，并产出不同的名义 Program。Surface 永远不由 Recipe 的形状来选中；是作者写下带命名空间的组件时选中它的。

## 5. Surface 输出法则

一个 Surface 只能产出：

1. 精确 Type 出现在其锁定 Manifest `outputs` allowlist 中的作者 Record；
2. Fragment 摘要由该次解码结果贡献的 AuthorComponent；
3. 不可变的 GraphFragment；
4. 非语义的 source-map 事实。

Frontend 用源码与 Frontend Closure 身份为作者 Record 的来源封印，校验其结构 Type，并在链接前让它通过
Host 的准入闸门。Surface 不能注入未声明 Type 的 Record。

由 Recipe 推导出的带类型 Program，应当包含其所属包做语义校验所需的任何源码摘要。它的作者来源已经绑定了
Surface 实现摘要和递归编译得到的 Source Closure。别名写法与文件系统位置的变化可能改变源码身份，但不会改变带类型的 Program 值，也不会改变最终 Graph 的含义。

## 6. 前向引用法则

两种情况被有意区别对待：

- 图依赖可以保持为符号化的 `component.output` 引用，在整份文档收集完毕之后再解析，因此普通组件的前向
  引用依然有效。
- 编译期的值检查要求 Record 已经完成作者编译。被 import 的源码总是可用的；而同一文档内的值定义，必须
  出现在检查它的 Surface 之前。

这不是某种 parser 模式或 Runtime 模式，而是取决于编译此刻是否需要那个值，还是稍后只需要一条带类型的图边。

## 7. 它不是什么

Surface Binding 不是：

- Core 的 Type 注册表；
- 隐式转换搜索；
- Runtime Producer 或付费 Operation；
- Provider 能力；
- 全局 SVS 解码器；
- 读取凭据、文件、网络或 Store 的许可。

当前的 Host 只执行显式注册的受信任 Surface 实现。要让任意社区 Surface 代码可以执行，必须先具备按字节锁定的代码、权限强制和隔离。

## 8. 可执行的证明

与视频无关的 `example.recipe-card` fixture 证明了这条边界：

1. SVS 产出通用 Recipe；
2. Card Surface 只读取自己显式写下的公开引用；
3. Card 在作者编译期校验 `fill` 与 `padding`；
4. Card 产出名义的 `CardAppearance` Record；
5. 运行时 Producer 消费的是 `CardAppearance`，不是 `SVS Recipe`；
6. 非法颜色在 BuildPlan 或任何外部操作出现之前就失败；
7. 只改源码 import 别名时，Program Record 与 Graph 身份保持不变。

视频相关的包必须使用同一套机制，而不是另开一条视频专用的编译器通路。
