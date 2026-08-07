---
title: 运行时与 Provider
description: 组件怎样连接 Seedance 等外部生成服务。
---

# 运行时与 Provider

普通视频作者不需要初始化 Runtime，也不需要在项目文件里写 API Key。

## 作者怎么用

登录一次 Provider：

```bash
svml provider login seedance
```

然后在视频里导入和使用组件：

```xml
<svml>
  <import as="seedance" from="@svml/seedance@1"/>

  <seedance:speaker
    script={story.segment.opening}
    character="./host.png"
    direction="正对镜头自然说话"
  />
</svml>
```

最后正常构建：

```bash
svml build main.svml
```

## 谁负责请求 API

`@svml/seedance` 包自己携带 Runtime 实现，负责排队、请求、轮询和下载。官方 CLI 在看到这个组件后自动加载它。Key 保存在系统钥匙串或用户的全局 SVML 配置里，不进入 `.svml`、锁文件或 Git。

::: info 尚未实现
这是计划中的普通用户体验，不是当前仓库已经提供的命令。现有实现只接受已经准备好的本地媒体与能力产物。
:::

只有把 SVML 嵌入自己产品的开发者，才需要接触 `createRuntime()` 之类的开发接口。
