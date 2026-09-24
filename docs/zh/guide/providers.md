---
title: 模型与 Provider
description: 选择账户、连接服务或添加模型，沿用同一套视频执行系统。
---

**Model** 定义要生成什么：输入、支持的参数和输出类型。**Provider** 知道如何通过某个服务完成这个请求。**Endpoint** 是配置好的 Provider 实例，包含服务地址、凭据引用和容量。Runtime Profile 将所需能力绑定到 Endpoint。

官方发行包含本地 Provider、HypiHub Provider，以及 TokenDance、HiAPI、Pollo、BeatAPI、Monid、MuAPI 六个使用 API Key 的 Provider，各自覆盖该服务提供的已安装模型。其他服务通过项目或作者自己的包接入；Agent 可以使用公开 SDK 编写所需接入，就像为视频创建视觉组件。[模型与部署服务](./service-partners.md) 集中介绍独立合作服务，它们沿用同一套扩展方式。选择执行服务，与[选择 Agent 工作环境](./agents.md)是两件事。

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

已有安装时，先检查所选 Profile 和凭据状态。起始 Profile 提供配置示例；连接账户或准备依赖前，先选择想使用的服务。[Run 与 Build](../quickstart/run.md) 介绍相关命令。

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

[完整项目 Provider 示例](https://github.com/hypit-ai/hypit/tree/main/examples/provider-package) 使用示意 API 展示参考上传、任务回执、结果收集与价格读取。示例随执行包分发，Agent 无需仓库 checkout 就能读取和改写。它包含两个包：`provider-images` 对应生成图像，`provider-videos` 对应生成视频——后者的服务接收更宽的参考词汇（图像、视频、音频以及首尾帧），并通过独立的结果收集步骤返回产物。

实现与服务请求形态相匹配的那个 Capability；同时生成图像和视频的服务可以在同一个包里声明两个 Capability。服务实际支持的范围常常比 Model 词汇表更窄，例如分辨率更少或最长时长更低。这个差异属于 Provider：在 Capability 的 `supports` 中报告它，让 `plan` 带原因拒绝请求，而不是修改共享 Model 或悄悄收窄作者的请求。

## 为远程视频任务建模

渲染视频的服务通常先提交任务、再轮询、最后下载结果，Endpoint SDK 将其表达为三个独立动作：

- `start` 提交请求并以该服务的任务 id 返回 `pending`。HTTP 超时约束的是这次 API 调用而非渲染本身，因此 `start` 在服务受理任务后立即返回。返回前通过 `checkpoint` 记录任务 id，这样即使 Build 被中断，也能指出它已发起的远程工作。
- `poll` 在任务运行期间返回 `pending`，完成时返回 `ready`，失败时带服务自身的错误码返回 `failed`。用 `wakeAfter(handle, delayMs)` 安排下一次检查。
- `collect` 下载已完成的素材，通过 `context.resources` 存储，并返回 Model 声明的结果值。把收集与轮询分离，可以让下载并发与任务并发分别配置。

字节尚不存在、要等上游步骤产出的输入，仍是普通图边。`compileWireRequest` 接收的 URL resolver 就是 Provider 上传参考并返回服务 URL 的位置，系统的其他部分因此无需了解该服务的上传协议。

## 价格与授权

Provider 可以声明本地执行没有 Provider 调用费用，或提供公开费率页面。它也可以使用 Endpoint 凭据读取当前费率，返回简洁摘要及原始价格材料。`hypit pricing <run>` 将费率与计划请求一起展示；未来素材的测量值在产物存在前仍是未知的。

费率帮助说明费用。用户的委托授权使用所选账户、按约定范围与预算付费。登录成功或账户有余额，是与这份授权分别成立的事实。
