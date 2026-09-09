---
title: Quickstart for Agent users
description: Clone a video from a Coding Agent in five steps.
---

Describe the video you want in plain language. The Agent uses the `/hypit` skill to do the rest.

## What you need

- A Coding Agent that can use skills, such as Claude Code or Codex.
- A reference video.

## 1. Install the Hypit skill

```bash
npx skills add hypit-ai/hypit -g
```

Start a Coding Agent anywhere. The Agent installs the Hypit tools on first use.

## 2. Clone a video and swap in your product

<video controls playsInline preload="metadata" width="100%" src="./quickstart/videos/clone_a_video_with_your_product.mp4"></video>

Give the Agent a file or a link, and say what changes:

```text
/hypit Clone this video: /path/to/video.mp4, and replace the product with Hypit (hypit.ai).
```

YouTube, Instagram and other platform links work; the Agent downloads the source. Change the host,
product, language, aspect ratio or call to action in the same sentence.

## 3. Log in to Hypit, or bring your own keys

<video controls playsInline preload="metadata" width="100%" src="./quickstart/videos/log_in_to_hypit_or_bring_your_own_key.mp4"></video>

When a model needs a credential, the Agent asks. One hypit.ai login covers every model Hypit hosts;
or give the Agent API keys for the providers you prefer. Credentials go into the system credential
store.

## 4. Check the quote, then approve

<video controls playsInline preload="metadata" width="100%" src="./quickstart/videos/check_the_quote_and_approve.mp4"></video>

Before spending anything, the Agent lists every paid request with its price. Approve, and it submits
the Build:

```text
Go.
```

## 5. Watch the finished video

<video controls playsInline preload="metadata" width="100%" src="./quickstart/videos/watch_the_finished_video.mp4"></video>

The Agent delivers the video and shows it to you in Studio. If you want changes, keep talking to the
Agent.
