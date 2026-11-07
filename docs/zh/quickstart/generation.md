---
title: 生成媒体与剪辑工程
description: 将生成执行与把媒体采纳进 NLE 工程分开。
---

Hypit 可以通过 Author Source、Model、Provider 与 Runtime Profile 描述和执行图片、视频、语音生成。
这张执行图回答“要生成什么、由哪个能力执行、Result 如何保留”。

NLE 回答的是已经采纳的素材放在哪里、如何 trim，以及画面、音频和特效怎样组合。它不会重新运行
模型，也不保留对生成请求的活依赖。

## 生成并检查

把所需 Author output 选为 Build Target：

```bash
hypit plan main.svml --target opening.video
hypit build main.svml --target opening.video --follow
```

Model 与 Provider 选择留在 Author Source 和 Runtime Profile。Build Result 按所属包的保留策略保存
执行记录和产物。

## 把结果采纳为素材

当一个 take 要进入剪辑时，把那次精确 Result 导出为普通工程文件：

```bash
hypit result export <build-id> --output opening.video --to assets/opening.mp4
```

将文件导入为 Media Asset 文档，再向 NLE 工程物化一个媒体箱条目和 Item。前端拖入与 Agent 调用
文件 API 做的是同类 revisioned edit；NLE 文档内不需要队列。

Media Asset manifest 保存稳定的解释事实，也可引用由包拥有的 Representation。它不记录文件来自
Seedance、相机、下载还是其他工具，因此采纳后的媒体真正与来源无关。

## 制作另一个 take

新生成产生新的 Result，不会静默替换已经采纳的文件或 Item。作者决定导入、替换媒体引用或同时
保留多个版本；现有放置与特效参数仍是普通 NLE 编辑。

执行流程见 [Target 与 Build](./run.md)，保存结构见 [NLE 工程结构](./tracks.md)。
