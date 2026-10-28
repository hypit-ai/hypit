---
title: Quickstart for Agent users
description: Turn a reference video into a new video for your presenter, product and audience.
---

Bring a video you like and tell the Agent what you want to make from it: your face, your product,
a new audience, or another variation. Hypit gives it the production knowledge and tools to understand
the reference, create the material, and compose an editable video.

## What you need

- A Coding Agent that can use skills, such as Claude Code or Codex.
- A reference video or a description of the video you want.

See [Use Hypit in your Agent](./guide/agents.md) for Agent environments and entry partners.

## 1. Install the Hypit skill

```bash
npx skills add hypit-ai/hypit -g
```

Open your video project in the Agent. The Skill supplies production knowledge; the `hypit` package
supplies the executable tools. The Agent checks for an existing installation and helps prepare any
missing tools. You do not need to clone the Hypit repository.

Hypit's framework is free to use; your Coding Agent and any model services use their own accounts
and pricing. Installing the Skill or executable does not include generation credits. If you bring
an API key, tell the Agent which service issued it and share its API documentation.

For an existing installation, ask the Agent to check `hypit version --check` and the
[release notes](https://github.com/hypit-ai/hypit/releases). Older versions can use
`hypit --version` and `npm view @hypit/hypit@latest version`. The executable and Skill have separate
update channels; the Agent can update the relevant installation while preserving your project.

## 2. Bring a reference and explain what should change

<video controls playsInline preload="metadata" width="100%" src="https://storage.googleapis.com/hypit-public-assets/quickstart/2026-09-10/clone_a_video_with_your_product.mp4"></video>

Give the Agent a file or a supported platform link, together with any face, product or brand material:

```text
/hypit Use this video as a reference: /path/to/video.mp4.
Replace the product with Hypit (hypit.ai), keeping the energetic opening and ranking format.
```

You can change the presenter, product, language, aspect ratio or call to action. The Agent studies
what makes the reference work, including how graphics and captions land on particular words, then
adapts the script and visual direction to your goal. It keeps its understanding and decisions in the
project and explains the direction as the work develops.

### **👉 [Get 100 FREE AI Avatars with unique voices](https://drive.google.com/drive/u/2/folders/18J9Fz7mkU3OQNJ-2Res3eIyFQ2cemIK5)**

## 3. Choose the services you want to use

<video controls playsInline preload="metadata" width="100%" src="https://storage.googleapis.com/hypit-public-assets/quickstart/2026-09-10/log_in_to_hypit_or_bring_your_own_key.mp4"></video>

The Agent checks the relevant tools and services already available. For a spoken reference, WhisperX
provides the words and their timing so the Agent can relate the picture to what is being said.
If it needs preparation, the Agent explains the local effort and hosted option before you choose.
Cached weights can reduce setup time; they do not choose a service for you.

[HypiHub](https://hypit.ai) offers hosted WhisperX and image, video and voice models through one
account. You can also use your own keys through existing or project-written Providers, and combine
local and hosted capabilities. The Agent connects what the next part of the work needs, explains
progress and shows its reference understanding before developing the material plan. Generation
accounts can be chosen when that plan establishes the models you need.

[Model and deployment services](./guide/service-partners.md) introduces service partners and
your own deployment option. [Models and Providers](./guide/providers.md) explains how they connect.

## 4. Agree on the cost and let production run

<video controls playsInline preload="metadata" width="100%" src="https://storage.googleapis.com/hypit-public-assets/quickstart/2026-09-10/check_the_quote_and_approve.mp4"></video>

Before paid work, the Agent explains the selected account, planned work and available rates or
estimated cost, including anything still unknown. Agree on the scope and budget; calls covered by
that agreement can then proceed together. A change of account, scope or budget gives you a new decision.

```text
Use my HypiHub account for this video, within the budget we agreed. Go ahead.
```

The Agent prepares the script, performance direction and image references to get the material right
from the start. While generation runs, it can build the graphics and captions. Hypit keeps the
execution and produced files in Build Results; the Agent reports progress as the work takes shape.

## 5. Watch the finished video and make it yours

<video controls playsInline preload="metadata" width="100%" src="https://storage.googleapis.com/hypit-public-assets/quickstart/2026-09-10/watch_the_finished_video.mp4"></video>

With the actual material in place, the Agent checks whether the layout, captions, graphics and
B-roll appear clearly and at the right moments. It delivers the video and can open Studio so you
can explore its timeline and edit supported properties.

Keep talking to make changes or variants. Suitable existing material stays in use while the Agent
changes the relevant script, component or placement. Your project remains editable in ordinary files.

For more detail, see [Making videos with an Agent](./guide/skill.md),
[Invocations and Builds](./quickstart/run.md), and [Studio](./quickstart/preview.md).
