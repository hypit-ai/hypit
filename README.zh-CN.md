<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/public/hypit-logo-light.svg">
    <img alt="Hypit" src="./docs/public/hypit-logo-dark.svg" width="400" height="122">
  </picture>
</p>

<h3 align="center">让 AI Agent 复刻任何爆款视频</h3>
<p align="center">一条命令，100 个变体，1 亿播放量。</p>

<p align="center">
  <a href="https://hypit.ai"><strong>Demo</strong></a>
  &nbsp;&bull;&nbsp;
  <a href="https://hypit.ai/zh/quickstart/"><strong>快速开始</strong></a>
  &nbsp;&bull;&nbsp;
  <a href="https://hypit.ai/zh/guide/develop/"><strong>开发指南</strong></a>
  &nbsp;&bull;&nbsp;
  <a href="./README.md"><strong>English</strong></a>
</p>

<p align="center">
  <a href="https://trendshift.io/repositories/229030"><img alt="Trendshift 全语言当日第一" src="https://trendshift.io/api/badge/trendshift/repositories/229030/daily"></a>
</p>

<p align="center">
  <a href="https://trendshift.io/repositories/229030"><img alt="Trendshift TypeScript 当日第一" src="https://trendshift.io/api/badge/trendshift/repositories/229030/daily?language=TypeScript"></a>
  <a href="https://trendshift.io/repositories/229030?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-229030" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/229030/weekly?language=TypeScript" alt="hypit-ai/hypit | Trendshift TypeScript 周榜" width="250" height="55"></a>
</p>

<p align="center">
  <img alt="Stars" src="https://img.shields.io/github/stars/hypit-ai/hypit?style=flat-square&color=FFD700&logo=github&logoColor=white&label=Stars">
  <a href="./package.json"><img alt="Node 22.15+" src="https://img.shields.io/badge/Node.js-22.15%2B-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white"></a>
  <a href="./package.json"><img alt="pnpm 10.33" src="https://img.shields.io/badge/pnpm-10.33-F69220?style=flat-square&logo=pnpm&logoColor=white"></a>
  <a href="./package.json"><img alt="TypeScript 5.9" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white"></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/License-Apache--2.0%20with%20conditions-E3B341?style=flat-square"></a>
</p>

<p align="center">
  <a href="https://hypit.ai"><img alt="Visit our website" src="https://img.shields.io/badge/Visit%20our%20website-DF3C68?style=for-the-badge&logo=hypit&logoColor=white"></a>
  <a href="https://discord.gg/85hnyQnxpn"><img alt="Join our Discord" src="https://img.shields.io/badge/Join%20our%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white"></a>
  <a href="https://t.me/hypitai"><img alt="Join our Telegram" src="https://img.shields.io/badge/Join%20our%20Telegram-26A5E4?style=for-the-badge&logo=telegram&logoColor=white"></a>
  <a href="https://x.com/hypitai"><img alt="Follow @hypitai on X" src="https://img.shields.io/badge/Follow%20%40hypitai-000000?style=for-the-badge&logo=x&logoColor=white"></a>
</p>

<p align="center">
  ⭐ <em>让更多人发现 Hypit，一起壮大社区。给仓库点个 Star！</em>
</p>

## Hypit

Hypit 为 AI Agent（Claude Code、Codex 等）提供了一套制作视频的语言和系统。给它一条视频，Agent 就能把它复刻成一份完整的 workflow：画面、字幕、B-roll、特效，全部锚定在词上，而不是秒上。

**需要说明的是：** 复刻视频是最快的入口，但不是唯一的入口。你可以从我们的模板开始，也可以描述你想要的视频，让 Agent 从零写出一份 workflow。生成模型同样不是必需的：字幕、动效和代码渲染的画面，不调用生成模型也能编译成一条成片，因此可以不产生模型服务费用。

![SVML 源文件与实时视频预览](https://github.com/user-attachments/assets/981c28e8-ddab-4164-85bc-03b5d71275dc)

<p align="center"><em>左侧是 SVML 源文件，右侧实时呈现对应视频。</em></p>

## 只安装一次

```bash
npx skills add hypit-ai/hypit -g
```

这条命令安装 Skill。首次使用时，Agent 会检查 Hypit 可执行程序，并按需协助安装。
视频项目可以放在任意位置。

Hypit 本身免费使用；Coding Agent 和模型服务各有自己的账号与费用。
HypiHub 是我们推荐的托管模型服务，也可以使用你自己的 API 或本地模型。
把服务名称和 API 文档告诉 Agent，它会据此配置合适的连接。

[Agent 工作环境与入口合作方](./docs/zh/guide/agents.md) ·
[模型与部署服务](./docs/zh/guide/service-partners.md)

## 示例

### UGC

[Generation source](examples/ranking-football/reference.svml) · [Run and production notes](examples/ranking-football/README.md)

<table>
  <tr>
    <th width="16%">参考视频</th>
    <td width="28%"></td>
    <td width="28%"><video src="https://github.com/user-attachments/assets/f573bdac-62da-4b5d-825d-54d5880a7026" controls muted></video></td>
    <td width="28%"></td>
  </tr>
  <tr>
    <th width="16%">复刻视频</th>
    <td width="28%"><video src="https://github.com/user-attachments/assets/3ffd9951-e423-4a48-ad8f-5c596627be69" controls muted></video></td>
    <td width="28%"><video src="https://github.com/user-attachments/assets/eb62372d-2464-4a4b-83ee-41e227f99a8e" controls muted></video></td>
    <td width="28%"><video src="https://github.com/user-attachments/assets/9ba050f6-355d-460c-b684-7344cf49c051" controls muted></video></td>
  </tr>
  <tr>
    <td colspan="4"><p><b>“GOAT DEBATE”</b>——一条 20 秒的足球 Tier List，把 Ronaldo 排进 D 级，把 Messi 排进 S 级。A-roll 是两段 Seedance 2 Mini 生成的 720p 吐槽片段，B-roll 是 GPT Image 2 生成的一张 2K 哥特女孩肖像和十张 1K 脑腐图；WhisperX 负责逐词对齐，排行榜跟着音效逐条落位，再配上彩色词盒卡拉 OK 字幕、丝滑的动画和抓耳的背景音乐，最后由 64 个无头 Chromium 进程并发渲染。</p><p>上面给出了三个复刻版本：把解说员换成香蕉猫；翻转排名，让 Ronaldo 成为 GOAT；把所有球员换成科技公司创始人。同一套爆款结构，可以产出完全不同的爆款视频。</p><p>总成本：<b>$1.15</b>。</p></td>
  </tr>
</table>

### 播客

[Generation source](examples/podcast/reference.svml) · [Run and production notes](examples/podcast/README.md)

<table>
  <tr>
    <th width="16%">参考视频</th>
    <td width="28%"></td>
    <td width="28%"><video src="https://github.com/user-attachments/assets/22df72b8-4831-4eb6-957d-676ae9b04f2d" controls muted></video></td>
    <td width="28%"></td>
  </tr>
  <tr>
    <th width="16%">复刻视频</th>
    <td width="28%"><video src="https://github.com/user-attachments/assets/9c14c5ae-bd12-4961-9d57-a46d3a2154c6" controls muted></video></td>
    <td width="28%"><video src="https://github.com/user-attachments/assets/f44c653b-f520-4715-9530-4c2f42114387" controls muted></video></td>
    <td width="28%"><video src="https://github.com/user-attachments/assets/92f9bf8b-4f83-4d9b-a0e8-ca27fab2cc94" controls muted></video></td>
  </tr>
  <tr>
    <td colspan="4"><p><b>“DAILY CREATINE”</b>——一条 18 秒的播客片段，肌肉芭比向一个瘦弱的大学生强推肌酸。A-roll 是 Seedance 2 Mini 生成的三段 720p 对峙镜头，外加一段展示理想生活方式的 B-roll；图像是 GPT Image 2 生成的两张 2K AI 角色肖像和三张 1K 蒙太奇画面。WhisperX 负责逐词对齐，再配上分屏访谈版式、区分说话人的卡拉 OK 字幕、产品递出的瞬间和背景音乐，最后由 64 个无头 Chromium 进程并发渲染。</p><p>上面给出了三个复刻版本：把两位主播换成 Pepe 和 Doge，争论狗狗手臂；把肌酸换成视黄醇，让漂亮男孩吐槽假小子的毛孔；把实体产品换成 CheatGPT 应用，让头脑简单的体育生绩点碾压博士生。同一套播客形式，三个广告垂类。</p><p>总成本：<b>$1.07</b>。</p></td>
  </tr>
</table>

### 街头采访

[Generation source](examples/interview/reference.svml) · [Run and production notes](examples/interview/README.md)

<table>
  <tr>
    <th width="16%">参考视频</th>
    <td width="28%"></td>
    <td width="28%"><video src="https://github.com/user-attachments/assets/666ad535-3231-44fb-b9bc-271817ae79de" controls muted></video></td>
    <td width="28%"></td>
  </tr>
  <tr>
    <th width="16%">复刻视频</th>
    <td width="28%"><video src="https://github.com/user-attachments/assets/c39a0425-2dcb-4709-b894-6a9423d351e3" controls muted></video></td>
    <td width="28%"><video src="https://github.com/user-attachments/assets/8f71552c-0ad1-4d29-8c4e-3b937ab7c887" controls muted></video></td>
    <td width="28%"><video src="https://github.com/user-attachments/assets/d9cab2e7-e08b-48ef-8d25-bc28ca9efc17" controls muted></video></td>
  </tr>
  <tr>
    <td colspan="4"><p><b>“NICE RIDE”</b>——一条 26 秒的街头采访，黑帮太太分享赚到第一个一百万的三条规则。三段由 Seedance 2 Mini 生成的 720p A-roll，一张由 GPT Image 2 生成的 2K AI 角色肖像；WhisperX 负责逐词对齐，再利用 Google Video Intelligence 和 YOLOv8 AnimeFace 提供的人脸边界框，驱动跟随人脸的说话人专属彩色字幕；配合跟音效同步的表情符号揭示板、彩色闪烁、揭示音效和背景音乐，最后由 64 个无头 Chromium 进程并发渲染。</p><p>上面给出了三个复刻版本：把主播换成 Wojak 和 Chad；把所有内容翻译成西班牙语，同时保持完全相同的 punchline；或者把兰博基尼换成 F1 赛车，让 Ada 向 Leon 解释自己如何因为开 Uber 意外赢得大奖赛。同样的三阶段揭示结构，三种不同的街头采访混剪。</p><p>总成本：<b>$1.09</b>。</p></td>
  </tr>
</table>

## 使用 Hypit skill

编程 Agent 可以直接使用 `/hypit` skill。在任意空目录或现有项目目录中开启会话，让 Agent 为你创建视频：

```text
/hypit 复刻这个视频：/path/to/video.mp4，把排行榜内容换成 Hypit（官网：hypit.ai）与其他 AI 视频产品的对比。
```

也可以不提供参考视频，直接从描述开始：

```text
/hypit 做一个 ranking 视频，把 Hypit 排到 S 级。
```

Agent 会检查环境，索要这条视频需要的凭据，生成素材并构建成片。

### **👉 [免费获得 100 个拥有独特音色的 AI 人物形象](https://drive.google.com/drive/u/2/folders/18J9Fz7mkU3OQNJ-2Res3eIyFQ2cemIK5)**

## 为什么选择 Hypit

- **真的能 Clone：** 丢一条视频进来，拿到整份 workflow —— 画面、字幕、B-roll、特效。不是拆解脚本。
- **一份 workflow，100 个变体：** 复用编排和已有素材，需要变化的部分再生成。
- **可插拔组件：** 换主播不动字幕。用组件库、fork 一个，或自己写。
- **开源：** Hypit 不按人头或渲染次数收费，也不添加水印。模型服务费用由你选择的服务方收取。

## Hypit 能构建什么

丢一条视频进来，Agent 把整套 workflow 克隆下来；或者直接描述你想要的视频，让它从零写一份。拿到的都是可编辑、可重跑的工作流，而不是一次性的成片。

- **信息流广告** —— 从 Meta 广告库拉一条正在跑的广告，克隆成 workflow，换上你的产品，当天发出 50 个 Hook 变体。两周后创意衰退，换一批开头重跑，主体一个字不动。
- **复刻爆款** —— 任何 TikTok、Reels、Shorts 都能变成模板：换主播、换 Hook、换产品、换语言、换画幅。
- **带货视频** —— 一个跑通的格式，每天换一个 SKU。换产品、换价格、换 CTA，转化率跑出来的结构原封不动。
- **AI UGC 与口播** —— 配音、词级字幕、B-roll、评论区贴纸、卡点剪辑，全部自动挂好。
- **播客与采访切片** —— 分屏布局、区分说话人的字幕、反应特效。
- **代码渲染的视频** —— 画面完全由前端代码驱动，本地渲染，无需调用生成模型 API。
- **多语言版本** —— 同一条视频十种语言。改一句台词，时间轴自己重排。

## 关注我们

给我们点个 Star，即可第一时间收到 GitHub 的所有版本发布通知！

![Stay tuned with us](https://github.com/user-attachments/assets/cc929974-96b8-4166-b81d-008e130b0f24)

## 贡献指南

欢迎提交 Pull Request，文档、示例和翻译与代码同样重要。可以认领一个已有的 issue，也可以为你想做的事新开一个，我们会协助你把它合并进来。环境准备、CI 会跑的检查和 Pull Request 流程见 [CONTRIBUTING.zh-CN.md](./CONTRIBUTING.zh-CN.md)。

创建组件是正常的视频制作工作，组件通常留在拥有它的视频项目中。所有者希望分享时，可以把同一份包作为版本化 tarball 直接交付，也可以发布到自己的 npm scope 或私有 registry。希望某个组件由 Hypit 官方 Distribution 维护时，先通过 issue 说明它解决的共同产品需求；官方收录与普通的社区分享是两件事。

[开发指南](https://hypit.ai/zh/guide/develop/)说明了前置条件、日常命令和仓库结构。

<table>
  <tr>
    <td>缺陷报告</td>
    <td><a href="https://github.com/hypit-ai/hypit/issues/new?template=bug_report.yml">提交 issue</a></td>
  </tr>
  <tr>
    <td>功能请求</td>
    <td><a href="https://github.com/hypit-ai/hypit/issues/new?template=feature_request.yml">提交 issue</a></td>
  </tr>
  <tr>
    <td>问题咨询</td>
    <td><a href="https://discord.gg/85hnyQnxpn">Discord</a> 或 <a href="https://t.me/hypitai">Telegram</a></td>
  </tr>
</table>

扫码加入 Hypit 微信群：

<img alt="扫码加入 Hypit 微信群" src="./docs/public/wechat-group.jpg" width="320">

## Launch 伙伴

<table>
  <tr>
    <td width="220" align="center">
      <a href="https://watcha.cn/r/geIiJJ">
        <picture>
          <source media="(prefers-color-scheme: dark)" srcset="./docs/public/watcha-dark.png">
          <img alt="观猹" src="./docs/public/watcha-light.png" width="170">
        </picture>
      </a>
    </td>
    <td><a href="https://watcha.cn/r/geIiJJ">观猹</a>是一个专为 AI 开发者打造的创新产品生态与社区，致力于连接优秀产品与高质量用户，助力每一个想法从 Demo 走向真实落地。从产品发现与真实反馈起步，观猹提供发布、分发与声誉追踪等支持，全方位陪伴开发者完成从产品上线到首批用户获取的全过程。</td>
  </tr>
  <tr>
    <td width="220" align="center">
      <a href="https://tokendance.space/?utm_source=hypit">
        <picture>
          <source media="(prefers-color-scheme: dark)" srcset="./docs/public/tokendance-dark.png">
          <img alt="TokenDance" src="./docs/public/tokendance-light.png" width="165">
        </picture>
      </a>
    </td>
    <td><a href="https://tokendance.space/?utm_source=hypit">TokenDance</a> 为开发者提供优化了推理成本的统一多模型网关。通过百亿 Token 补贴和开发者计划，TokenDance 帮助早期开发者大幅降低成本，更专注于产品验证与业务增长。</td>
  </tr>
  <tr>
    <td width="220" align="center">
      <a href="https://autoclaw.zhipuai.cn/"><img alt="AutoClaw" src="./docs/public/autoclaw.png" width="180"></a>
    </td>
    <td><a href="https://autoclaw.zhipuai.cn/">AutoClaw</a> 是智谱推出的桌面端 AI 工作助手，深度适配 GLM 模型，融合法律、金融、设计等领域的专属知识库与工作流。</td>
  </tr>
  <tr>
    <td width="220" align="center">
      <a href="https://openagents.org/blog/posts/2026-09-08-pilot-user-program-zh-hypit"><img alt="OpenAgents" src="./docs/public/openagents.png" width="180"></a>
    </td>
    <td><a href="https://openagents.org">OpenAgents Workspace</a> 是一个让你管理智能体的产品，它能让你随时随地调用在任何设备上运行的 Agent（手机 + 电脑端均可）。Agents 可以在其中协同合作，帮你完成任务、提升效率。现支持 Claude、Codex、Openclaw、Hermes 等 20 余种 agent 接入。</td>
  </tr>
  <tr>
    <td width="220" align="center">
      <a href="https://monid.ai?fpr=alvin-45480b">
        <picture>
          <source media="(prefers-color-scheme: dark)" srcset="./docs/public/monid-logo-white.svg">
          <img alt="Monid" src="./docs/public/monid-logo-blue.svg" width="150">
        </picture>
      </a>
    </td>
    <td><a href="https://monid.ai?fpr=alvin-45480b">Monid</a> 是 Agent 工具的 OpenRouter：一个 key、一个钱包、数百种工具，按调用计费。Hypit 可以把 Seedance 的视频、图像、语音和词级转写路由到 Monid。</td>
  </tr>
  <tr>
    <td width="220" align="center">
      <a href="https://www.hiapi.ai/invite/hypit"><img alt="HiAPI" src="./docs/public/hiapi.png" width="165"></a>
    </td>
    <td><a href="https://www.hiapi.ai/invite/hypit">HiAPI</a> 是一个统一的 AI 图片、视频、音频和语言模型 API 平台，支持 GPT Image 2.5、Seedance 2.0、Veo 3.1、可灵、万相等主流模型。HiAPI 提供在线 Playground、Remote MCP 和 Agent Skills，可接入 Claude Code、Cursor 等 AI 编程工具。平台按量付费，无月费，新用户注册可获得免费体验积分。</td>
  </tr>
  <tr>
    <td width="220" align="center">
      <a href="https://api.pollo.ai/?utm_source=hypit"><img alt="Pollo API" src="./docs/public/pollo.jpg" width="120"></a>
    </td>
    <td><a href="https://api.pollo.ai/?utm_source=hypit">Pollo API</a> 通过单个 API 为开发者提供 300 多个 AI 图片与视频模型，价格具备竞争力。一个 API key 即可接入多家模型服务商，请求规模从 10 次到 10000 次以上均可承载。</td>
  </tr>
  <tr>
    <td width="220" align="center">
      <a href="https://beatapi.io/sign-up?aff=hypit"><img alt="BeatAPI" src="./docs/public/beatapi.png" width="165"></a>
    </td>
    <td><a href="https://beatapi.io/sign-up?aff=hypit">BeatAPI</a> 是面向各类 Agent 的专业能力层，提供 AI 模型、真实世界数据、可直接调用的任务能力和专业工作空间，帮助 Agent 完成真实世界的任务。</td>
  </tr>
</table>

## ⭐ Star History

<a href="https://www.star-history.com/?repos=hypit-ai%2Fhypit&type=date&logscale=&legend=bottom-right">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=hypit-ai/hypit&type=date&theme=dark&legend=bottom-right" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=hypit-ai/hypit&type=date&legend=bottom-right" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=hypit-ai/hypit&type=date&legend=bottom-right" />
 </picture>
</a>

## 贡献者

<a href="https://github.com/hypit-ai/hypit/graphs/contributors">
  <img alt="Contributors" src="https://contrib.rocks/image?repo=hypit-ai/hypit">
</a>

## 许可证

Hypit 采用 [Hypit 开源许可证](./LICENSE)。你创作的视频和其他产出归你所有；第三方模型与服务可能另有条款。
