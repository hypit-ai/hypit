# 本地跑通 Alibaba（Wanx / DashScope）视频生成

本目录把用户 fork 的 `feature/alibaba-video` 分支在本地拼成可运行形态：

- `packages/alibaba-video/` —— 模型 + SVML 表面（`<alibaba:TextVideo>` / `<alibaba:ReferenceVideo>`），
  声明能力 `alibaba-qwen-vvg`。分支原文件逐字放入；**仅 `src/activation.ts` 被改写**
  （原分支写的是裸 `export function activate(context)`，但 hypit 0.1.9 的包加载器
  `packages/package-loader-node/src/loader.ts` 要求默认导出是 `hypit.node-package@1`
  贡献对象，否则报 “activation has no default package export”。已对齐到 `@hypit/seedance` 的写法）。
- `packages/provider-wanx/` —— 分支缺的 **Endpoint**：真正调用 DashScope 的 Wanx 视频 API。
- `hypit.runtime.json` —— 把能力 `@hypit/alibaba-video@1#alibaba-qwen-vvg` 绑定到本地端点 `wanx.personal`。
- `demo.svml` —— 最小可跑样例。

## 本地运行步骤（网络/构建由你本机执行）

```bash
cd E:/tools/hypit-alibaba

# 1) 安装工作区依赖（联网一步；会用 pnpm workspace 把上面两个包软链进 node_modules）
pnpm install

# 2) 写入 DashScope / 阿里云 API Key（存进本机 OS 凭据库，key = wanx.personal）
hypit auth login wanx.personal --runtime alibaba-wanx/hypit.runtime.json
#    提示输入时粘贴你的 DASHSCOPE_API_KEY

# 3) 真正生成视频（--follow 会一直等到出片）
hypit build alibaba-wanx/demo.svml --runtime alibaba-wanx/hypit.runtime.json --follow
```

出片后视频产物在 `.hypit/execution/...` 下，CLI 会打印结果路径。

## 模型名（已按本地控制台对齐）

分支把能力叫 `alibaba-qwen-vvg`（“Qwen VVG”），但阿里云**实际对外可调用**的视频生成模型名
**不固定**（控制台可见的 video 模型会随账号/区域变）。本地测试统一用 `wan3.0-video`
（用户控制台里唯一可用的 video 模型），已写入三处默认值：

- `provider.ts` 的 `DEFAULT_MODEL_T2V` = `DEFAULT_MODEL_I2V` = `"wan3.0-video"`
- `activation.ts` 里 `config.model` 兜底默认 `"wan3.0-video"`
- `hypit.runtime.json` 里 `endpoints.wanx.personal.config.model` = `"wan3.0-video"`

> ⚠️ 跑通前注意：wan3.0 的 **请求参数 schema** 可能和 wanx2.1 不同
> （本 Provider 目前按 wanx2.1 提交 `parameters: { size, duration }`）。
> 如果本地 `hypit build --follow` 报参数错误（如 4xx / `InvalidParameter`），把报错
> 贴给我，我按 wan3.0 的真实入参改 `provider.ts` 的 `start()` 即可——这是运行时行为，
> 需要你本机实际打一次才知道。

- 想临时换模型：改 `hypit.runtime.json` 的 `config.model` 即可，不必动代码。
- 文生视频走 `model`；当 SVML 带 `reference-image` 时自动切到 `modelI2V`（当前同 `wan3.0-video`）。

## 改 SVML 自测

`demo.svml` 用 `<alibaba:TextVideo>`。图生视频写法（参考分支 README）：

```markup
<alibaba:ReferenceVideo
  id="styled"
  model="qwen-vvg"
  prompt={prompt}
  duration="6"
  resolution="1080p"
  aspect-ratio="9:16"
  reference-image={style.image}
/>
```

属性范围（模型端口限定）：`prompt` ≤200 字、`duration` 5–10、`resolution` 480p/720p/1080p、
`aspect-ratio` 1:1/16:9/9:16/4:3/3:4、`referenceImage` 可选图片。

## 排错

- 报 “installed packages do not provide @hypit/alibaba-video@1#alibaba-qwen-vvg”：
  多半是 `pnpm install` 没跑 / 没成功，导致 `node_modules/@hypit/alibaba-video` 软链不存在。
- 报能力 unsupported：检查 `demo.svml` 的 `prompt` 是否引用了一个存在的 `<wording:Value>`。
- DashScope 返回 4xx：确认 API Key 与模型名（Wanx）对该账号可用。
