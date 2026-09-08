---
title: Quickstart for Agent users
description: Create, review and ship Hypit videos from a Coding Agent without writing SVML or SVS by hand.
---

You do not need to know SVML, SVS, JavaScript or the command line. Describe your video in ordinary
language; the Agent uses the `/hypit` skill to understand the reference, direct the work and deliver
a video with an editable project.

## What you need

- A Coding Agent that can use skills, such as Claude Code or Codex.
- A reference video or a creative brief.

## 1. Install the Hypit skill

Install the Hypit skill:

```bash
npx skills add hypit-ai/hypit -g
```

Then start a Coding Agent anywhere; the Hypit skill is available globally. The Skill supplies
production knowledge. The Agent checks whether the Hypit command is installed and sets up the
executable tools when needed.

## 2. Describe the video you want

<video controls playsInline preload="metadata" width="100%" src="./quickstart/videos/describe_the_video_you_want.mp4"></video>

You can take either of two paths.

### Clone a reference video

Ask the Agent to clone a video and provide its local file path:

```text
/hypit clone this video: /path/to/video.mp4
```

You can also provide a link from an online video platform. The Agent uses `yt-dlp` to download the
source automatically. For example:

```text
/hypit clone this video: https://www.youtube.com/watch?v=VIDEO_ID
/hypit clone this video: https://www.instagram.com/reel/REEL_ID/
```

Tell the Agent what should change, if anything: the host, language, product, aspect ratio, visual
style or call to action. The reference is treated as evidence about the editorial structure. The
Agent does not merely summarize it; it creates an editable program that can be reviewed and built.

### Create an original video

You can describe an idea just as you would brief a human producer. For example:

```text
Create a ranking video with a ranking board that has five rows. The left side labels the rows S, A, B,
C and D, with a different color for each tier; the right side is for placing the icons assigned to
each tier. Put Hypit in S tier and explain its advantages. Also include Arcads, Higgsfield, Seedance
and CapCut. Give each competitor a fair, concise summary of its strengths and weaknesses. Make the
result clear, energetic and suitable for a short social video.
```

You can add constraints such as audience, duration, language, tone, brand colors, presenter, platform
or aspect ratio. The Agent turns the brief into a complete plan and fills in production details from
the information you provide.

## 3. Provide credentials when the Agent asks

<video controls playsInline preload="metadata" width="100%" src="./quickstart/videos/provide_credentials_when_the_agent_asks.mp4"></video>

After you describe the video, the Agent checks which models and services the project needs. If a
required credential is missing, it will ask you for it and explain what it is used for. You have two
options:

1. **Use Hypit's recommended Hypit.ai OAuth login.** Tell the Agent to log in through hypit.ai. This
   single OAuth flow covers all models that Hypit provides through its hosted service, so you do not
   need to collect separate keys for each model.
2. **Use your own provider keys.** You can tell the Agent which models to use and provide API keys
   from the corresponding providers. The Agent will request only the keys needed for this project
   and will not ask for unrelated credentials.

Never paste a secret into a public document or commit it to Git. The Agent stores credentials using
the configured secure credential store.

## 4. Let the Agent do the production work

<video controls playsInline preload="metadata" width="100%" src="./quickstart/videos/let_the_agent_do_the_production_work.mp4"></video>

The Agent understands the reference in terms of your goal. Timed frames and words help it explain
the story, pacing, and the purpose and timing of captions, B-roll and graphics. A replacement person
or product shapes the script and creative direction from the beginning.

It records those decisions in project files, selects or writes suitable components, generates media,
and composes the video around its semantic timeline. Studio and selected-range renders help check
layout, timing and readability. The Agent reuses existing media and keeps you informed about material
decisions, progress and problems.

## 5. Review the composition in Studio

<video controls playsInline preload="metadata" width="100%" src="./quickstart/videos/review_the_mock_studio.mp4"></video>

Studio displays the media, captions and graphics selected by the current Run. The Agent can inspect
composition with existing material and continue refining it as generated media becomes available.

Check whether the story is clear, captions are readable, the product or ranking board has enough
prominence, and B-roll appears where it helps. Describe the change you want:

```text
The board appears too late and the captions are too small. Bring the board in with the words
introducing the ranking, and make the captions larger.
```

The Agent changes the relevant parts and shows the updated composition.

## 6. Approve and submit the paid Build

<video controls playsInline preload="metadata" width="100%" src="./quickstart/videos/approve_and_submit_the_paid_build.mp4"></video>

Before new paid work, the Agent explains the selected models, expected external work and available
pricing information. Authorize a concrete production scope:

```text
Generate the media and finish the video with this direction, within the budget we agreed.
```

The Agent submits a Build and follows its outcome. Completed media and outputs remain in the
project's Result. If an attempt fails, the Agent explains the failure and reuses available outputs
through a new Run and Build.

## 7. Review the finished video

<video controls playsInline preload="metadata" width="100%" src="./quickstart/videos/review_the_paid_result.mp4"></video>

When the Build finishes, the Agent provides the final video and its saved location. Review the
content, captions, transitions, framing and sound against your goal. Describe any changes you want;
the project retains editable Sources and generated media.

## 8. Request natural-language changes

<video controls playsInline preload="metadata" width="100%" src="./quickstart/videos/request_natural_language_changes.mp4"></video>

After a successful Build, you can continue directing the project conversationally. You may change
the host, replace B-roll, alter the ranking-board treatment, translate the script, adjust the tone or
switch the aspect ratio. For example:

```text
Keep the script and ranking order, but replace the host with a calm male presenter and make the board
look like a paper sports magazine.
```

The Agent traces each request to the relevant source and component, preserves what you asked it to
keep, and reuses existing outputs. New paid generation follows your authorized scope.

## 9. Create multiple variants in parallel

<video controls playsInline preload="metadata" width="100%" src="./quickstart/videos/create_multiple_variants_in_parallel.mp4"></video>

When you want several versions, first tell the Agent the dimensions that may vary. It will discuss
the intended directions with you, for example:

- one version with a different host;
- one version translated into Spanish;
- one version with a product-focused opening;
- one version with faster cuts and denser B-roll.

The Agent records the shared parts and each version's changes, then gives every variant explicit
production choices. Independent work can execute concurrently within the Runtime's configured
capacity; shared media can be reused. You receive each finished video, its project files and a clear
account of completion.
