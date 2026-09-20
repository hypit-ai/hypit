---
title: 模型与部署服务
description: 托管模型 API、自有模型部署，以及独立服务合作方。
---

根据视频需要的素材选择服务。这与[在哪个 Agent 中工作](./agents.md)是不同的选择。

HypiHub 是 Hypit 推荐的集成托管服务，提供已支持的生成与 WhisperX 能力，Provider 随 Hypit
维护。本地能力仍可通过本地 Provider 使用，用户自己的服务通过项目 Provider 接入。

下面介绍的合作方是独立服务，各有自己的账户、条款、价格、模型可用性和 API。
合作关系提供一个了解服务的入口，不共用 HypiHub 账户。
发行包为下面每个服务内置了一个使用 API Key 的 Provider，覆盖该服务提供的已安装模型，
并按该服务的输入限制报告不支持的请求；具体清单见各 Provider 的 README。
服务提供、但不在这个范围内的模型，通过普通的 [Model 与 Provider](./providers.md) 扩展方式连接。

## 模型与工具 API 合作方

### TokenDance

[TokenDance](https://tokendance.space) 是多模型网关。
[`@hypit/provider-tokendance`](https://github.com/hypit-ai/hypit/blob/main/packages/provider-tokendance/README.md)
按 TokenDance 文档中的方舟与 MiniMax 协议提供 Seedance 2.0、2.5 系列、Seedream 5.0 lite 和 MiniMax H3。
其他模型见它的[文档索引](https://tokendance.space/llms.txt)和实时模型目录。

### HiAPI

[HiAPI](https://www.hiapi.ai) 通过一个异步任务接口提供图片、视频和音频模型。
[`@hypit/provider-hiapi`](https://github.com/hypit-ai/hypit/blob/main/packages/provider-hiapi/README.md)
提供发行包已描述的 Seedance、Seedream 5.0 lite、MiniMax H3、GPT Image 2、Nano Banana 和 Grok Imagine 模型。
其余模型见它的[模型索引](https://www.hiapi.ai/docs/models.json)。

### Pollo

[Pollo AI](https://docs.pollo.ai) 按模型路径提供视频和图片生成。
[`@hypit/provider-pollo`](https://github.com/hypit-ai/hypit/blob/main/packages/provider-pollo/README.md)
提供 MiniMax H3、Grok Imagine 1.5、GPT Image 2 和 Nano Banana。
Pollo 只接受公网 URL 形式的参考素材，带参考素材的请求需要由嵌入方提供 URL。

### BeatAPI

[BeatAPI](https://docs.beatapi.io/quick-guide) 通过一个异步任务接口提供视频和图片模型。
[`@hypit/provider-beatapi`](https://github.com/hypit-ai/hypit/blob/main/packages/provider-beatapi/README.md)
提供 Seedance 2.0、2.5 系列、MiniMax H3、Grok Imagine 1.5、GPT Image 2 和 Nano Banana，
并通过 BeatAPI 的文件接口上传参考素材。
其余模型见它的[视频](https://docs.beatapi.io/video-api)与[图片](https://docs.beatapi.io/image-api)模型索引。

### Monid

[Monid](https://monid.ai) 是 Hypit 的服务合作方。
[它的文档](https://monid.ai/docs)介绍了工具发现、输入与价格查询，以及调用方式。
[`@hypit/provider-monid`](https://github.com/hypit-ai/hypit/blob/main/packages/provider-monid/README.md)
提供 Seedance 2.0、2.5 系列端点、MiniMax H3 与 Wan 2.7 图像模型，并通过 Monid 的工作区文件系统上传参考素材。
使用 Monid 的其他工具时，[HTTP API 文档](https://monid.ai/docs/api/overview)提供接入依据，
Agent 可以在项目包中实现这次所需的请求与结果映射。

## 自己部署模型

部署平台提供运行模型的地方，部署得到的推理服务沿用 Model–Provider–Endpoint 的关系接入。
完整协议兼容时复用 Provider，否则在项目包中实现该服务的 API。算力和部署费用属于所选云账户，
HypiHub 额度不支付这份部署。

[使用自有模型部署](./providers.md#使用自有模型部署)说明自己管理服务环境时需要处理什么。
没有合作关系、没有官方内置 Provider，也可以使用一份合适的部署。
