---
title: 模型与 Provider
description: 选择账户、连接服务或添加模型，沿用同一套视频执行系统。
---

**Model** 定义要生成什么：输入、支持的参数和输出类型。**Provider** 知道如何通过某个服务完成这个请求。**Endpoint** 是配置好的 Provider 实例，包含服务地址、凭据引用和容量。Runtime Profile 将所需能力绑定到 Endpoint。

官方发行包含本地 Provider、HypiHub Provider 和 OrcaRouter Provider。其他服务通过项目或作者自己的包接入；Agent 可以使用公开 SDK 编写所需接入，就像为视频创建视觉组件。[服务合作方介绍](../../guide/service-partners.md) 集中介绍独立合作服务，它们沿用同一套扩展方式。

## 根据需求选择修改位置

| 你想做什么 | 修改哪里 |
| --- | --- |
| 同一服务换 Key | 凭据引用与所选 Endpoint 配置 |
| 换成协议兼容的服务地址 | Provider 已支持的地址或部署配置 |
| 同一模型换成不同 API 来源 | 安装或编写该 API 的 Provider，并选择它的 Endpoint |
| 使用尚未定义的新模型 | 添加 Model 包，并由支持其请求的 Provider 执行 |

两个服务即使提供同一个模型，请求格式、限制和可用参数也可能不同。Provider 检查请求是否受该服务支持，并说明不匹配的原因。Profile 决定使用哪个来源；该来源报错并不授权通过另一个账户花钱。

已有安装时，先检查所选 Profile 和凭据状态。起始 Profile 提供配置示例；连接账户或准备依赖前，先选择想使用的服务。[Run 与 Build](../quickstart/run.md) 介绍相关命令。

## OrcaRouter

[OrcaRouter](https://www.orcarouter.ai) 是 OpenAI 兼容的 AI 网关：一个端点提供多家厂商的模型，并带有自适应路由、故障转移和网关级防护。它的 Provider 是
`@hypit/provider-orcarouter`，通过 `https://api.orcarouter.ai/v1` 提供 `chat` 能力。

Endpoint 只声明一个凭据槽，但提供两个入口：`OrcaRouter - API` 填写用户已有的 `sk-orca-…` 密钥；`OrcaRouter - Auth` 运行 OAuth 2.0 + PKCE 授权，返回属于同一账户的密钥。两者都把普通 API 密钥存入 Runtime Profile 选择的 Credential Store，无论密钥来自哪个入口，到达中转服务的方式完全相同。

模型列表通过配置的密钥读取 `GET /v1/models`，因此可选模型就是该账户真正可调用的模型。能力不靠模型名推断：文本控件只提供目录中标明支持 chat 端点的条目，附加图片时只提供目录中明确声明图片输入的条目。目录读取失败时，面板保留一份小的已验证备用列表并标明其为降级状态，而不是显示空列表。

PKCE 签发的密钥是长期密钥，不是可刷新的令牌：在用户于 `https://www.orcarouter.ai/console/authorized-apps` 撤销之前一直复用。密钥被拒绝时应重新授权，而不是尝试刷新。

## 添加 Model

项目包使用 `@hypit/hypit/model-kit`、`@hypit/hypit/generation` 和 `@hypit/hypit/author-kit`。声明准确的请求端口、参数取值、输出类型和能力。作者 Surface 把 Prompt Text 与参考素材连接到请求，再将生成素材作为普通图输出公开。

[Model SDK](https://github.com/hypit-ai/hypit/blob/main/packages/model-kit/README.md) 提供请求定义与 activation 示例。包拥有模型接口；凭据与 HTTP 映射由 Provider 负责。

## 添加 Provider

将选定的 `@hypit/hypit` 版本作为开发依赖，使用公开 SDK：

```ts
import { defineEndpointPackage } from "@hypit/hypit/endpoint-kit";
import type { AsyncEndpoint, CredentialRef, EndpointRequest } from "@hypit/hypit/endpoint-kit";
```

实现服务支持的准确能力与输出类型，将请求端口映射到服务 API，解析声明的凭据并返回结果。即时操作可以直接返回；远程任务可以先提交得到 ID，再轮询完成情况、收集输出文件。并发和动作限制由 Endpoint 的资源声明负责。

真正的失败会结束本次执行尝试。Build Result 保留已完成的 Output 与公开任务回执。后续工作通过新的 Run 与 Build，选择仍适用的已有 Output 复用。

[Endpoint SDK](https://github.com/hypit-ai/hypit/blob/main/packages/endpoint-kit/README.md) 维护处理接口、activation、资源声明和价格 API。将包编译为 JavaScript，由项目包管理器安装。在 [Runtime Profile](./runtime.md) 的 `endpoints` 中配置实例，并通过 `bindings` 选择它。

[完整项目 Provider 示例](https://github.com/hypit-ai/hypit/tree/main/examples/provider-package) 使用示意 API 展示参考上传、任务回执、结果收集与价格读取。示例随执行包分发，Agent 无需仓库 checkout 就能读取和改写。

## 价格与授权

Provider 可以声明本地执行没有 Provider 调用费用，或提供公开费率页面。它也可以使用 Endpoint 凭据读取当前费率，返回简洁摘要及原始价格材料。`hypit pricing <run>` 将费率与计划请求一起展示；未来素材的测量值在产物存在前仍是未知的。

费率帮助说明费用。用户的委托授权使用所选账户、按约定范围与预算付费。登录成功或账户有余额，是与这份授权分别成立的事实。
