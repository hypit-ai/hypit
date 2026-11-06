<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/public/hypit-logo-light.svg">
    <img alt="Hypit" src="./docs/public/hypit-logo-dark.svg" width="400" height="122">
  </picture>
</p>

<h3 align="center">AI エージェントで、どんなバイラル動画もクローンできます</h3>
<p align="center">コマンド 1 つで、100 のバリエーション、1 億回の再生。</p>

<p align="center">
  <a href="https://hypit.ai"><strong>デモ</strong></a>
  &nbsp;&bull;&nbsp;
  <a href="https://hypit.ai/quickstart/"><strong>クイックスタート</strong></a>
  &nbsp;&bull;&nbsp;
  <a href="https://hypit.ai/guide/develop/"><strong>開発ガイド</strong></a>
  &nbsp;&bull;&nbsp;
  <a href="./README.md"><strong>English</strong></a>
  &nbsp;&bull;&nbsp;
  <a href="./README.zh-CN.md"><strong>简体中文</strong></a>
</p>


<p align="center">
  <a href="https://trendshift.io/repositories/229030"><img alt="Trendshift #1 Repository of the Day" src="https://trendshift.io/api/badge/trendshift/repositories/229030/daily"></a>
</p>

<p align="center">
  <a href="https://trendshift.io/repositories/229030"><img alt="Trendshift #1 TypeScript Repository of the Day" src="https://trendshift.io/api/badge/trendshift/repositories/229030/daily?language=TypeScript"></a>
  <a href="https://trendshift.io/repositories/229030?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-229030" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/229030/weekly?language=TypeScript" alt="hypit-ai/hypit | Trendshift TypeScript Weekly" width="250" height="55"></a>
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
  ⭐ <em>より多くの人が Hypit を見つけられるよう、コミュニティを一緒に育ててください。このリポジトリにスターをお願いします！</em>
</p>

## Hypit

Hypit は、AI エージェント（Claude Code、Codex など）に、動画を作るための言語とシステムを提供します。動画を入れると、エージェントがそれを完全なワークフローとしてクローンします。映像、字幕、B ロール、エフェクトのすべてが、秒ではなく単語に結び付けられます。

**誤解のないように言うと：** 動画のクローンは最も手早い入口ですが、唯一の方法ではありません。テンプレートから始めることも、作りたい動画を説明するだけでエージェントにゼロからワークフローを書かせることもできます。生成モデルも任意です。ワークフローは、生成モデルを呼び出すことも、そのサービス料金を払うこともなく、字幕、モーショングラフィックス、コードで描画したビジュアルを完成した動画にコンパイルできます。

![SVML のソースと動画のライブプレビュー](https://github.com/user-attachments/assets/981c28e8-ddab-4164-85bc-03b5d71275dc)

<p align="center"><em>左が SVML のソース、右がそれに対応してライブでレンダリングされる動画です。</em></p>

## 一度だけインストール

```bash
npx skills add hypit-ai/hypit -g
```

これで Skill がインストールされます。最初に使うときに、エージェントが Hypit の実行ファイルを確認し、必要であれば準備を手伝います。動画のプロジェクトはどこに置いてもかまいません。

Hypit は無料で使えます。Coding Agent とモデルのサービスには、それぞれのアカウントと料金があります。HypiHub は、私たちがおすすめするホスティング型のモデルサービスです。独自の API やローカルのモデルを使うこともできます。エージェントにサービス名と API のドキュメントを伝えれば、適切な接続を設定してくれます。

[エージェントの環境とエントリーパートナー](./docs/guide/agents.md) ·
[モデルとデプロイのサービス](./docs/guide/service-partners.md)

## 作例

### UGC

[生成のソース](examples/ranking-football/reference.svml) · [実行と制作のメモ](examples/ranking-football/README.md)

<table>
  <tr>
    <th width="16%">参照元</th>
    <td width="28%"></td>
    <td width="28%"><video src="https://github.com/user-attachments/assets/f573bdac-62da-4b5d-825d-54d5880a7026" controls muted></video></td>
    <td width="28%"></td>
  </tr>
  <tr>
    <th width="16%">クローン</th>
    <td width="28%"><video src="https://github.com/user-attachments/assets/3ffd9951-e423-4a48-ad8f-5c596627be69" controls muted></video></td>
    <td width="28%"><video src="https://github.com/user-attachments/assets/eb62372d-2464-4a4b-83ee-41e227f99a8e" controls muted></video></td>
    <td width="28%"><video src="https://github.com/user-attachments/assets/9ba050f6-355d-460c-b684-7344cf49c051" controls muted></video></td>
  </tr>
  <tr>
    <td colspan="4"><p><b>"GOAT DEBATE"</b> — ロナウドを D、メッシを S に置く、20 秒のサッカーのティア表です。Seedance 2 Mini 720p による煽りの A ロールが 2 本、GPT Image 2 による 2K のゴス少女のポートレートと 1K のブレインロットな B ロールが 10 本、WhisperX による単語のアライメント、音に同期したランキングボード、カラーボックスのカラオケ字幕、とても滑らかなアニメーション、耳に残る BGM を、64 個のヘッドレス Chromium のプロセスで並行してレンダリングしています。</p><p>3 つのクローンを収録しています。ナレーターを banana cat に替えたもの、ランキングをひっくり返してロナウドが GOAT になるもの、選手全員をテック企業の創業者に置き換えたものです。バイラルの構造は同じで、バイラル動画としては別物です。</p><p>合計コスト：<b>$1.15</b>。</p></td>
  </tr>
</table>

### ポッドキャスト

[生成のソース](examples/podcast/reference.svml) · [実行と制作のメモ](examples/podcast/README.md)

<table>
  <tr>
    <th width="16%">参照元</th>
    <td width="28%"></td>
    <td width="28%"><video src="https://github.com/user-attachments/assets/22df72b8-4831-4eb6-957d-676ae9b04f2d" controls muted></video></td>
    <td width="28%"></td>
  </tr>
  <tr>
    <th width="16%">クローン</th>
    <td width="28%"><video src="https://github.com/user-attachments/assets/9c14c5ae-bd12-4961-9d57-a46d3a2154c6" controls muted></video></td>
    <td width="28%"><video src="https://github.com/user-attachments/assets/f44c653b-f520-4715-9530-4c2f42114387" controls muted></video></td>
    <td width="28%"><video src="https://github.com/user-attachments/assets/92f9bf8b-4f83-4d9b-a0e8-ca27fab2cc94" controls muted></video></td>
  </tr>
  <tr>
    <td colspan="4"><p><b>"DAILY CREATINE"</b> — マッチョなバービーがやせた大学生にクレアチンを押し付ける、18 秒のポッドキャストのクリップです。Seedance 2 Mini 720p による対決の A ロールが 3 本と憧れのライフスタイルの B ロール、GPT Image 2 による 2K の AI キャラクターのポートレートが 2 枚と 1K のモンタージュのパネルが 3 枚、WhisperX による単語のアライメント、画面分割のインタビューのレイアウト、話者を区別するカラオケ字幕、商品を手渡す場面、BGM を、64 個のヘッドレス Chromium のプロセスで並行してレンダリングしています。</p><p>3 つのクローンを収録しています。2 人のホストを Pepe と Doge に替えて犬の腕について言い争わせるもの、クレアチンをレチノールに置き換えて美少年がボーイッシュな女の子の毛穴をいじるもの、物理的な商品をやめて CheatGPT というアプリにし、脳筋のイケメンが博士課程の学生より高い GPA を取るものです。ポッドキャストの形式は同じで、3 つの広告ジャンルに展開しています。</p><p>合計コスト：<b>$1.07</b>。</p></td>
  </tr>
</table>

### 街頭インタビュー

[生成のソース](examples/interview/reference.svml) · [実行と制作のメモ](examples/interview/README.md)

<table>
  <tr>
    <th width="16%">参照元</th>
    <td width="28%"></td>
    <td width="28%"><video src="https://github.com/user-attachments/assets/666ad535-3231-44fb-b9bc-271817ae79de" controls muted></video></td>
    <td width="28%"></td>
  </tr>
  <tr>
    <th width="16%">クローン</th>
    <td width="28%"><video src="https://github.com/user-attachments/assets/c39a0425-2dcb-4709-b894-6a9423d351e3" controls muted></video></td>
    <td width="28%"><video src="https://github.com/user-attachments/assets/8f71552c-0ad1-4d29-8c4e-3b937ab7c887" controls muted></video></td>
    <td width="28%"><video src="https://github.com/user-attachments/assets/d9cab2e7-e08b-48ef-8d25-bc28ca9efc17" controls muted></video></td>
  </tr>
  <tr>
    <td colspan="4"><p><b>"NICE RIDE"</b> — マフィアの妻が、最初の 100 万ドルを稼ぐための 3 つのルールを明かす、26 秒の街頭インタビューです。Seedance 2 Mini 720p による A ロールが 3 本、GPT Image 2 による 2K の AI キャラクターのポートレートが 1 枚、WhisperX による単語のアライメント、Google Video Intelligence と YOLOv8 AnimeFace による顔のバウンディングボックスで頭を追跡する話者ごとの色の字幕、色のフラッシュと効果音付きで音に同期して明かされる絵文字のボード、BGM を、64 個のヘッドレス Chromium のプロセスで並行してレンダリングしています。</p><p>3 つのクローンを収録しています。ホストを Wojak と Chad に替えたもの、オチをまったく同じにしてすべてをスペイン語に翻訳したもの、ランボルギーニを F1 カーに替えて、Uber の運転がどうやって偶然のグランプリ優勝につながったかを Ada が Leon に説明するものです。3 段階で明かす構成は同じで、それぞれ別の街頭インタビューのリミックスになっています。</p><p>合計コスト：<b>$1.09</b>。</p></td>
  </tr>
</table>

## Hypit の Skill を使う

`/hypit` の Skill は、コーディングエージェントで使えます。空のプロジェクトでも既存のプロジェクトでも、そのディレクトリでセッションを始めて、動画を作るよう頼んでください。

```text
/hypit Clone this video: /path/to/video.mp4, and replace the ranking content with a comparison of Hypit (official website: hypit.ai) with other AI video products.
```

参照する動画なしで始めることもできます。

```text
/hypit Make a ranking video that puts Hypit in S tier.
```

エージェントは、環境を確認し、動画に必要な認証情報を求め、素材を生成して、完成したコンポジションを組み立てます。

### **👉 [ユニークな声を持つ AI アバターを 100 体無料でゲット](https://drive.google.com/drive/u/2/folders/18J9Fz7mkU3OQNJ-2Res3eIyFQ2cemIK5)**

## Hypit を選ぶ理由

- **どんな動画もクローン：** 動画を入れると、映像、字幕、B ロール、エフェクトを含むワークフロー全体が手に入ります。台本の分解ではありません。
- **1 つのワークフローで 100 のバリエーション：** コンポジションと既存の素材を再利用し、変わる部分だけを生成します。
- **差し替えられるコンポーネント：** 字幕に触れずにホストを替えられます。インストール済みのパッケージを使うことも、作例を応用することも、自分で書くこともできます。
- **オープンソース：** Hypit の席ごとの料金も、レンダリングごとの料金も、追加の透かしもありません。モデルのサービスの利用料は、選んだサービスから請求されます。

## Hypit で作れるもの

動画を入れればエージェントがワークフロー全体をクローンし、作りたいものを説明すればゼロから書いてくれます。どちらの場合も、1 回きりのレンダリングではなく、編集して何度でも実行し直せるコンポジションが手に入ります。

- **有料のソーシャル広告** — Meta 広告ライブラリから当たった広告をクローンし、自社の商品に差し替えて、その日のうちに 50 種類のフックを出せます。2 週間で効果が落ちたら、新しい冒頭で実行し直します。本体はまったく変わりません。
- **バイラル動画のクローン** — どんな TikTok、Reel、Short もテンプレートになります。ホスト、フック、商品、言語、アスペクト比を差し替えられます。
- **TikTok Shop とアフィリエイトの動画** — 成果の出る形式を 1 つ決めれば、毎日新しい SKU を出せます。商品、価格、CTA を差し替え、うまくいった構成はそのまま残します。
- **AI による UGC と話す人の動画** — ナレーション、単語レベルの字幕、B ロール、コメントのステッカー、ビートに同期したカットが、すべて自動でつながります。
- **ポッドキャストとインタビューのクリップ** — 画面分割のレイアウト、話者を区別する字幕、リアクションのオーバーレイ。
- **コードで描画する動画** — ビジュアルを完全にフロントエンドのコードで動かし、生成 API を呼ばずにローカルでレンダリングします。
- **ローカライズ版** — 同じ動画を 10 の言語で。1 行書き直せば、タイミングが自動で流し直されます。

## 最新情報をチェック

スターを付けると、GitHub からすべてのリリース通知をすぐに受け取れます！

![最新情報をチェック](https://github.com/user-attachments/assets/cc929974-96b8-4166-b81d-008e130b0f24)

## コントリビュートの方法

プルリクエストを歓迎します。ドキュメント、作例、翻訳もコードと同じくらい大切です。オープンな issue を選ぶか、取り組みたいことについて issue を作成してください。マージまで私たちがお手伝いします。[CONTRIBUTING.md](./CONTRIBUTING.md) には、セットアップ、CI が実行するチェック、プルリクエストの流れが書かれています。

コンポーネントを作るのはふつうの動画制作の作業で、コンポーネントは通常、それを持つ動画のプロジェクトの中に置かれます。所有者が共有したい場合は、同じパッケージをバージョン付きの tarball として渡すか、所有者の npm のスコープやプライベートなレジストリで公開できます。Hypit の公式の Distribution で保守するコンポーネントの提案は、共有の製品ニーズを説明する issue から始めてください。公式への取り込みは、ふつうのコミュニティでの共有とは別のものです。

[開発ガイド](https://hypit.ai/guide/develop/)では、前提条件、日々のコマンド、リポジトリの構成を説明しています。

<table>
  <tr>
    <td>バグの報告</td>
    <td><a href="https://github.com/hypit-ai/hypit/issues/new?template=bug_report.yml">issue を作成</a></td>
  </tr>
  <tr>
    <td>機能のリクエスト</td>
    <td><a href="https://github.com/hypit-ai/hypit/issues/new?template=feature_request.yml">issue を作成</a></td>
  </tr>
  <tr>
    <td>質問</td>
    <td><a href="https://discord.gg/85hnyQnxpn">Discord</a> または <a href="https://t.me/hypitai">Telegram</a></td>
  </tr>
  <tr>
    <td>既存のプロジェクトのアップグレード</td>
    <td><a href="./migrations/0.3.md">0.3 の移行ガイド</a> · <a href="./migrations/0.3.1.md">0.3.1 の SDK の移行ガイド</a></td>
  </tr>
</table>

## ローンチパートナー

<table>
  <tr>
    <td width="220" align="center">
      <a href="https://watcha.cn/r/geIiJJ">
        <picture>
          <source media="(prefers-color-scheme: dark)" srcset="./docs/public/watcha-dark.png">
          <img alt="Watcha" src="./docs/public/watcha-light.png" width="170">
        </picture>
      </a>
    </td>
    <td><a href="https://watcha.cn/r/geIiJJ">Watcha</a> は、AI のビルダーのために作られた革新的なエコシステムとコミュニティで、優れたプロダクトと質の高いユーザーをつなぎ、あらゆるデモを現実にします。AI プロダクトの発見と本音のフィードバックを出発点に、プロダクトの公開、配信、評判の追跡を提供し、ローンチから初期の普及までビルダーを支えます。</td>
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
    <td><a href="https://tokendance.space/?utm_source=hypit">TokenDance</a> は、推論のコストを最適化した、統一されたマルチモデルのゲートウェイをビルダーに提供しています。Billion-Token Subsidy や Developer Program などのプログラムを通じて、初期段階のビルダーのコストを下げ、プロダクトの検証と成長に集中できるようにしています。</td>
  </tr>
  <tr>
    <td width="220" align="center">
      <a href="https://agentsky.dev/">
        <picture>
          <source media="(prefers-color-scheme: dark)" srcset="./docs/public/agentsky-dark.png">
          <img alt="AgentSky" src="./docs/public/agentsky-light.png" width="165">
        </picture>
      </a>
    </td>
    <td><a href="https://agentsky.dev/">AgentSky</a> は、Claude Code、Codex、OpenClaw、Hermes などの AI エージェントを動かすためのクラウドプラットフォームです。各エージェントが自分専用のクラウドのコンピューターで作業し、コーディング、調査、日々のタスクに取り組むのを手伝います。CLI と MCP の連携により、ユーザーは既存のワークフローから直接、エージェントを見つけ、仕事を任せ、結果を受け取れます。</td>
  </tr>
  <tr>
    <td width="220" align="center">
      <a href="https://autoclaw.z.ai"><img alt="AutoClaw" src="./docs/public/autoclaw.png" width="180"></a>
    </td>
    <td><a href="https://autoclaw.z.ai">AutoClaw</a> は Z.ai の仕事向けのデスクトップ AI アシスタントで、GLM のモデルに深く最適化され、法務、金融、デザインなどの専門のナレッジベースとワークフローが統合されています。</td>
  </tr>
  <tr>
    <td width="220" align="center">
      <a href="https://openagents.org/blog/posts/2026-09-08-pilot-user-program-zh-hypit"><img alt="OpenAgents" src="./docs/public/openagents.png" width="180"></a>
    </td>
    <td><a href="https://openagents.org">OpenAgents Workspace</a> は、AI エージェントの管理を助けるプロダクトで、どのデバイス（スマートフォンでもコンピューターでも）で動いているエージェントも、いつでもどこでも呼び出せます。エージェントはプラットフォームの中で協力してタスクの完了を助け、効率を高めます。現在、Claude、Codex、OpenClaw、Hermes など、20 種類以上のエージェントとの連携に対応しています。</td>
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
    <td><a href="https://monid.ai?fpr=alvin-45480b">Monid</a> は、エージェントのツールのための OpenRouter です。1 つのキー、1 つのウォレットで数百のツールを使え、呼び出しごとに課金されます。Hypit は、Seedance の動画、画像、音声、単語レベルの文字起こしを Monid に振り分けられます。</td>
  </tr>
  <tr>
    <td width="220" align="center">
      <a href="https://www.hiapi.ai/invite/hypit"><img alt="HiAPI" src="./docs/public/hiapi.png" width="165"></a>
    </td>
    <td><a href="https://www.hiapi.ai/invite/hypit">HiAPI</a> は、AI の画像、動画、音声、言語のモデルのための統一された API プラットフォームです。GPT Image 2.5、Seedance 2.0、Veo 3.1、Kling、Wan などの人気のモデルに 1 つのプラットフォームから接続できます。月額料金なしの従量課金で、新しいユーザーには無料のトライアルクレジットがあります。</td>
  </tr>
  <tr>
    <td width="220" align="center">
      <a href="https://api.pollo.ai/?utm_source=hypit"><img alt="Pollo API" src="./docs/public/pollo.jpg" width="120"></a>
    </td>
    <td><a href="https://api.pollo.ai/?utm_source=hypit">Pollo API</a> は、1 つの API で 300 以上の AI の画像と動画のモデルを、競争力のある料金で使えるようにします。1 つの API キーで複数のモデルプロバイダーにつながり、10 から 10,000 以上のリクエストまでスケールします。</td>
  </tr>
  <tr>
    <td width="220" align="center">
      <a href="https://beatapi.io/sign-up?aff=hypit"><img alt="BeatAPI" src="./docs/public/beatapi.png" width="165"></a>
    </td>
    <td><a href="https://beatapi.io/sign-up?aff=hypit">BeatAPI</a> は、あらゆるエージェントのためのプロフェッショナルな機能のレイヤーです。AI のモデル、実世界のデータ、タスクにすぐ使える機能、プロフェッショナルなワークスペースを提供し、エージェントが実世界のタスクを完了できるようにします。</td>
  </tr>
  <tr>
    <td width="220" align="center">
      <a href="https://www.sume.com">
        <picture>
          <source media="(prefers-color-scheme: dark)" srcset="./docs/public/sume-dark.png">
          <img alt="Sume" src="./docs/public/sume-light.png" width="150">
        </picture>
      </a>
    </td>
    <td><a href="https://www.sume.com">Sume</a> は、主要な AI の画像・動画モデルを単一の API で提供します。料金はモデル提供元の価格のままで、上乗せは 0% です。</td>
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

## Contributors

<a href="https://github.com/hypit-ai/hypit/graphs/contributors">
  <img alt="Contributors" src="https://contrib.rocks/image?repo=hypit-ai/hypit">
</a>

## ライセンス

Hypit は [Hypit Open Source License](./LICENSE) のもとで公開されています。あなたが作った動画などの出力は、あなたのものです。サードパーティーのモデルやサービスには、独自の規約がある場合があります。

パートナーコミュニティ：[LINUX DO](https://linux.do/)
