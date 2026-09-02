# 视频创作工作方式

Hypit 把创作、执行和结果分开：

- Source、Recipe、Run 描述要做什么；
- Runtime 执行一次 Build；
- Result 记录这次 Build 实际产生了什么；
- reference-video-tools 帮助作者理解、预览和检查内容，不管理 Build 历史或项目历史。

项目不再维护 route 数据库、revision 历史、恢复游标或批次总状态。可继续工作的依据是项目中
真实存在的 Source、媒体和报告，而不是另一个系统对 agent 过去操作的复原。

## 从真实需求开始

先判断任务是原创还是参考视频复刻，再查看现有包和它们公开的词汇：

```bash
hypit-reference-video-tools list_svml_packages
hypit-reference-video-tools inspect_svml_vocabulary --package <package>
hypit-reference-video-tools inspect_visual_schema
```

现有 Surface 能表达需要的视觉角色时直接复用。只有确实缺能力时才开发项目本地 author
package，不能为了一个项目去修改已安装包。

## 原创视频

用最小的 Source、Recipe、Run 表达需求，然后分别查看它们的真实情况：

```bash
hypit-reference-video-tools validate_local_author_packages --run ./build.svrun
hypit-reference-video-tools validate_script_cues --run ./build.svrun
hypit check ./build.svrun
hypit-reference-video-tools preview_check ./build.svrun
hypit-reference-video-tools layout_check --run ./build.svrun
```

这些命令是相互独立的报告，不会互相批准或解锁。只有报告和设计需求共同说明存在实际问题时
才修改项目。布局测量只是候选提示；有意的几何关系可以用 `layout_accept` 写下理由。这个理由
关联的是可读的结构发现名称，不是整个项目快照。

需要看具体视觉时，直接渲染相关元素和时间窗口，再按照明确的创作意图阅读结果：

```bash
hypit-reference-video-tools render_element ./build.svrun \
  --element title --segment intro --out ./review/title-intro.mp4
hypit-reference-video-tools review_element --run ./build.svrun \
  --element title --segment intro --video ./review/title-intro.mp4 \
  --intent-file ./review/title-intent.md
```

`authoring_check` 可以汇总画面覆盖、播放策略和已经记录的 review，但它不是项目状态，也不是
提交 Build 的前置条件。

## 参考视频复刻

先准备参考视频：

```bash
hypit-reference-video-tools prepare_reference --video-path ./reference.mp4 --observer agent
hypit-reference-video-tools observe_reference --reference-id <reference-id>
```

拆出的镜头、代表帧、逐词转录和观察结果保存在 `.hypit/reference-video-tools/`。它们本身就是
有用内容。使用 `agent` observer 时，`record_observation` 负责填写明确返回的待回答观察。

根据画面、文字和时间信息创作项目。需要比较时，把相关元素在相同 Script 窗口中渲染出来：

```bash
hypit-reference-video-tools render_element ./build.svrun \
  --element ranking --segment list --reference-id <reference-id> \
  --out ./review/ranking-list.mp4
hypit-reference-video-tools compare_reconstruction \
  --reference-id <reference-id> --run ./build.svrun --segment list \
  --video ./review/ranking-list.mp4 --element ranking
```

每次明确发起的比较都是一次新的观察。工具不会根据文件摘要静默复用旧答案。
`reconstruction_check` 只汇总哪些内容看过、哪些没看过，不持有工作流游标。

## Build 与复用

外部生成涉及费用时先运行 `hypit plan`；用户需要执行时再运行 `hypit build`。Build 的公开输出
进入它自己的 Result。组件公开输出端口产生的中间图片、视频或结构值也会保存，因此后续工作
可以直接指向它们，不需要把 Run target 偷换成所有中间值的清单。

即使 Run 文件完全没变，多次 Build 仍然得到互相独立的 Result。重要的 Result 和输出使用
Result presentation 命令赋予人类名称，不建立内容摘要、中心 artifact 表或隐藏历史系统。

批量变体使用普通项目目录和调用者明确维护的任务清单。复制、调度和命名属于调用者或专门的
批处理工具；reference-video-tools 不再维护第二套 variant 状态机。
