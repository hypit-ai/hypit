---
title: 模型与 Provider
description: 选择账户、连接服务或添加模型，沿用同一套视频执行系统。
---

**Model** 定义要生成什么：输入、支持的参数和输出类型。**Provider** 知道如何通过某个服务完成这个请求。**Endpoint** 是配置好的 Provider 实例，包含服务地址、凭据引用和容量。Runtime Profile 将所需能力绑定到 Endpoint。

起始 Profile 包含本地服务与 HypiHub。其他服务通过视频项目安装的 Provider 包接入。告诉 Agent 想使用哪个服务并提供 API 文档，Agent 可以安装已有包或创建项目 Provider。[模型与部署服务](./service-partners.md) 介绍可选服务。选择执行服务，与[选择 Agent 工作环境](./agents.md)是两件事。

HypiHub 是我们推荐的集成托管服务。**BYOK** 指使用自己账户的 API Key：Key 通过兼容的 Provider 连接到签发它的服务。告诉 Agent 你已有哪个服务及其 API 文档，具体接线和项目包可以由 Agent 完成。Key 负责授权请求，本身不会实现 API 接口。一个项目可以为不同能力使用不同服务，分别使用各自的账户并按各自规则计费。

## 根据需求选择修改位置

| 你想做什么 | 修改哪里 |
| --- | --- |
| 同一服务换 Key | 凭据引用与所选 Endpoint 配置 |
| 换成协议兼容的服务地址 | Provider 已支持的地址或部署配置 |
| 在自己的云部署上运行模型 | 准备推理服务，再配置兼容 Provider 或实现其 API |
| 同一模型换成不同 API 来源 | 安装或编写该 API 的 Provider，并选择它的 Endpoint |
| 使用尚未定义的新模型 | 添加 Model 包，并由支持其请求的 Provider 执行 |

两个服务即使提供同一个模型，请求格式、限制和可用参数也可能不同。Provider 检查请求是否受该服务支持，并说明不匹配的原因。Profile 决定使用哪个来源；该来源报错并不授权通过另一个账户花钱。

已有安装时，先检查所选 Profile 和凭据状态。起始 Profile 提供配置示例；连接账户或准备依赖前，先选择想使用的服务。[Invocation 与 Build](../quickstart/run.md) 介绍相关命令。

## 使用自有模型部署

你可以在自己管理的算力上运行模型，将得到的推理服务连接到 Hypit。云平台提供部署与算力，
Model 定义生成请求，Provider 实现推理服务的 API，Endpoint 选择实际部署地址与凭据。

完整协议一致时，可以用已有 Provider 连接新的部署。API 不同时，可以在项目里创建
`packages/provider-my-cloud/` 这样的包。实现边界取决于服务协议，而不是云平台的品牌。
如果 Hypit 尚未定义该模型，再补充相应的 Model 定义。

准备部署可能涉及模型文件、算力配置与推理进程。Agent 可以按所选平台和模型的说明，
建立可用服务并说明其持久性与算力费用；平台管理权限与推理调用凭据可能是分开的。
部署可用后，通过 Endpoint 接收普通生成请求；部署准备与视频 Build 执行各有自己的生命周期。

## 添加 Model

服务引入了现有 Model 未描述的请求形态时，创建项目 Model 包。从作者视角定义 Prompt、参考角色、可选项和输出素材。[Generation 包 README](https://github.com/hypit-ai/hypit/blob/main/packages/generation/README.md#model-contract) 提供所选发行版的准确 API 与包示例。凭据与 HTTP 映射由 Provider 负责。

## 添加 Provider

创建项目 Provider 包，把已选择的 Model 连接到 API 或本地服务。实现该服务真正支持的请求形态与限制，用项目包管理器安装，然后在 [Runtime Profile](./runtime.md) 的 `endpoints` 中配置，并通过 `bindings` 选择。[Endpoint 包 README](https://github.com/hypit-ai/hypit/blob/main/packages/endpoint/README.md) 负责准确 TypeScript API 与包字段。

[完整项目 Provider 示例](https://github.com/hypit-ai/hypit/tree/main/examples/provider-package) 使用示意 API 展示参考上传、任务回执、结果收集与价格读取。示例随执行包分发，Agent 无需仓库 checkout 就能读取和改写。它包含两个包：`provider-images` 对应生成图像，`provider-videos` 对应生成视频——后者的服务接收更宽的参考词汇（图像、视频、音频以及首尾帧），并通过独立的结果收集步骤返回产物。

实现与服务请求形态相匹配的那个 Capability；同时生成图像和视频的服务可以在同一个包里声明两个 Capability。服务实际支持的范围常常比 Model 词汇表更窄，例如分辨率更少或最长时长更低。这个差异属于 Provider：在 Capability 的 `supports` 中报告它，让 `plan` 带原因拒绝请求，而不是修改共享 Model 或悄悄收窄作者的请求。

## 价格与授权

Provider 可以声明本地执行没有 Provider 调用费用，或提供公开费率页面。它也可以使用 Endpoint 凭据读取当前费率，返回简洁摘要及原始价格材料。`hypit pricing <source>` 将费率与计划请求一起展示；未来素材的测量值在产物存在前仍是未知的。

费率帮助说明费用。用户的委托授权使用所选账户、按约定范围与预算付费。登录成功或账户有余额，是与这份授权分别成立的事实。
