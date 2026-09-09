---
title: Quickstart for Agent users
description: Create, review and ship Hypit videos from a Coding Agent without writing SVML or SVS by hand.
---

You do not need to know SVML, SVS, JavaScript or the command line. Describe your video in ordinary
language; the Agent uses the `/hypit` skill to understand the reference, direct the work and deliver
a video with an editable project.

The recordings illustrate example conversations and editing views. Interface details and commands
may differ; the guidance below describes the current workflow.

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
executable tools when needed, explaining any setup that needs your choice.

## 2. Describe the video you want

<video controls playsInline preload="metadata" width="100%" src="https://storage.googleapis.com/hypit-public-assets/quickstart/2026-09-09/describe_the_video_you_want.mp4"></video>

Start with a reference to adapt or an idea to develop.

### Clone a reference video

Ask the Agent to clone a video and provide its local file path:

```text
/hypit clone this video: /path/to/video.mp4
```

You can also provide a link from an online video platform. The Agent uses `yt-dlp` to download the
source from supported sites. For example:

```text
/hypit clone this video: https://www.youtube.com/watch?v=VIDEO_ID
/hypit clone this video: https://www.instagram.com/reel/REEL_ID/
```

Tell the Agent what should change, if anything: the host, language, product, aspect ratio, visual
style or call to action. The Agent studies what makes the reference work and adapts its script, performances and visual
relationships to your goal. You receive a finished video and an editable project.

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

## 3. Choose the services for your project

<video controls playsInline preload="metadata" width="100%" src="https://storage.googleapis.com/hypit-public-assets/quickstart/2026-09-09/provide_credentials_when_the_agent_asks.mp4"></video>

The Agent first checks the tools and services already available for this project. It explains any
missing capability and helps you choose how to provide it. For a spoken reference, WhisperX supplies
the transcript and word timings used to understand the video. The Agent checks for a local setup;
if needed, it can help prepare one or use a hosted service you choose.

You can use your own provider accounts, or choose HypiHub for hosted transcription and generation
through one account. Tell the Agent which services you already use and whether you prefer local
setup or hosted tools. It opens login after you choose to connect that service. The recording shows
the HypiHub login option.

Use the service's login or credential setup to connect your account. Credentials belong in the
configured credential store, while the project records which services to use.

## 4. Agree on the paid work

<video controls playsInline preload="metadata" width="100%" src="https://storage.googleapis.com/hypit-public-assets/quickstart/2026-09-09/approve_and_submit_the_paid_build.mp4"></video>

Before using a paid service, the Agent explains the account, work to be performed and available
pricing information. Agree on the production scope and budget, for example:

```text
Use my selected account to make this video, including transcription and media generation,
within a total budget of $5. Keep me informed as it progresses.
```

Your authorization covers that agreed work as it proceeds. If you want only an analysis first,
authorize that scope; the production can be priced once its direction is clear. An expanded scope,
a different paying account or work beyond the budget brings a new decision back to you.

The recording illustrates approving a production request. Actual prices and local or hosted
processing depend on the services selected for your project.

## 5. Let the Agent produce the video

<video controls playsInline preload="metadata" width="100%" src="https://storage.googleapis.com/hypit-public-assets/quickstart/2026-09-09/let_the_agent_do_the_production_work.mp4"></video>

The Agent understands the reference in terms of your goal. Timed frames and words help it explain
the story, pacing, and the purpose and timing of captions, B-roll and graphics. A replacement person
or product shapes the script and creative direction from the beginning.

It records the direction, writes the image and performance prompts, and arranges the references
that connect the generated material. While independent generation is running, it can write the
components and prepare the composition. Spoken material supplies the semantic timing for captions
and graphics; wordless animation can use its own authored rhythm.

With the actual material available, the Agent checks how the layout, motion and timing work together
and refines the relevant components. Existing media stays available for reuse, and you receive
updates about creative decisions, progress and problems.

Builds save their completed media and outputs. If an attempt fails, the Agent explains what happened
and uses available work in a new Run and Build, within the agreed scope.

## 6. Review the finished video

<video controls playsInline preload="metadata" width="100%" src="https://storage.googleapis.com/hypit-public-assets/quickstart/2026-09-09/review_the_paid_result.mp4"></video>

When the Build finishes, the Agent provides the final video and its saved location. Review the
content, captions, transitions, framing and sound against your goal. Describe any changes you want;
the project retains editable Sources and generated media.

### Explore the editable project in Studio

<video controls playsInline preload="metadata" width="100%" src="https://storage.googleapis.com/hypit-public-assets/quickstart/2026-09-09/review_the_mock_studio.mp4"></video>

Alongside the finished video, the Agent can open Studio to show the editable composition. Its
Preview, Timeline and Inspector let you explore how the media, captions and graphics fit together.

The recording shows the timeline and editing interface with placeholder media. In your project,
the Agent opens a Run that selects your existing production material. If you are working remotely,
a screenshot or short recording can introduce the project too.

You can make a concrete request such as:

```text
Bring the board in with the words introducing the ranking, and make the captions larger.
```

The Agent changes the relevant source or component and checks the updated composition.

## 7. Request natural-language changes

<video controls playsInline preload="metadata" width="100%" src="https://storage.googleapis.com/hypit-public-assets/quickstart/2026-09-09/request_natural_language_changes.mp4"></video>

After a successful Build, you can continue directing the project conversationally. You may change
the host, replace B-roll, alter the ranking-board treatment, translate the script, adjust the tone or
switch the aspect ratio. For example:

```text
Keep the script and ranking order, but replace the host with a calm male presenter and make the board
look like a paper sports magazine.
```

The Agent traces each request to the relevant source and component, preserves what you asked it to
keep, and reuses existing outputs. New paid generation follows your authorized scope.

## 8. Create multiple variants in parallel

<video controls playsInline preload="metadata" width="100%" src="https://storage.googleapis.com/hypit-public-assets/quickstart/2026-09-09/create_multiple_variants_in_parallel.mp4"></video>

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
