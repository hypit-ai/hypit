---
title: Quickstart for Agent users
description: Create, review and ship Hypit videos from a Coding Agent without writing SVML or SVS by hand.
---

You do not need to know SVML, SVS, JavaScript or the command line. Describe your video in ordinary
language; the Agent uses the `/hypit` skill to create or reconstruct it and provides a Studio mock
for review before any paid Build.

## What you need

- A Coding Agent that can use skills, such as Claude Code or Codex.
- A reference video or a creative brief.

## 1. Install the Hypit skill

Install the Hypit skill:

```bash
npx skills add hypit-ai/hypit -g
```

Then start a Coding Agent anywhere; the Hypit skill is available globally.

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

## 3. Configure credentials

<video controls playsInline preload="metadata" width="100%" src="./quickstart/videos/provide_credentials_when_the_agent_asks.mp4"></video>

After you describe the video, the Agent checks which models and services the project needs. Hypit
uses HypiHub OAuth by default for hosted models. If that credential is missing, tell the Agent to
sign in to HypiHub; the Agent runs the login command, opens the browser flow and stores the session
in the secure OS credential store. The login itself does not submit a paid generation.

Only if you explicitly choose an author-owned Provider should you configure its API key instead. The
Agent requests only the credentials declared by the selected Runtime Profile; it does not silently
switch Providers because one credential is unavailable.

Never paste a secret into a public document or commit it to Git. The Agent stores credentials using
the configured secure credential store.

## 4. Let the Agent do the production work

<video controls playsInline preload="metadata" width="100%" src="./quickstart/videos/let_the_agent_do_the_production_work.mp4"></video>

Once you submit the brief, the Agent works through the project automatically without requiring you to
write source code. It normally proceeds to the Studio mock, but may ask a focused clarification when
the reference or brief does not establish an important editorial detail. The exact sequence depends
on the video, but it generally includes:

1. **Breaking the request into shots.** The Agent identifies the spoken sections, visual beats,
   transitions, captions, B-roll opportunities and any persistent elements such as a ranking board.
2. **Analyzing the reference or brief.** For a clone, it uses Gemini and the available media tools to
   inspect timing, composition, text, speakers and visual continuity. For an original, it resolves
   the same questions from your description and the selected creative direction.
3. **Resolving details.** The Agent uses the reference, brief and observation results to settle
   timing, language, product placement and host treatment automatically.
4. **Reading existing package declarations.** Before inventing an implementation, it checks the
   components already available in the project and in Hypit's official packages. This lets it reuse
   a caption, ranking, presenter, B-roll or rendering component when one already fits.
5. **Writing a new package when needed.** If the requested visual behavior is genuinely missing, the
   Agent creates the smallest reusable component required and records how it is used. You do not need
   to design the package interface yourself.
6. **Creating the source and checking it.** The Agent writes the SVML/SVS source, creates the needed
   Run configuration, compiles the graph, and fixes type or layout problems it finds.
   It also selects the project Runtime Profile and starts the local Runtime before any managed
   capability is used.
7. **Comparing against a mock.** It produces mock media for unbuilt generations, renders the complete
   composition in Studio, compares what it sees with the reference or brief, and repairs issues such
   as incorrect timing, hierarchy, cropping, captions or visual density.
8. **Applying your requested changes.** After establishing the base video, it applies the changes in
   your brief, such as replacing the person on screen or adapting the video to your product, then
   checks the updated result.

## 5. Review the mock Studio

<video controls playsInline preload="metadata" width="100%" src="./quickstart/videos/review_the_mock_studio.mp4"></video>

When the first pass is ready, the Agent opens a Studio mock for you. A mock is a review version: it
uses deterministic stand-ins for media that has not been generated yet, while preserving the real
timing, layout, captions, transitions and track relationships. It is intended to answer “does this
video work?” before you pay for the final media and rendering.

Watch the mock from beginning to end. Check the story, the order of the shots, the readability of
captions, the prominence of the ranking board or product, the rhythm of B-roll, and whether the
overall tone matches your brief. If something is wrong, describe the problem in ordinary language:

```text
The board appears too late, the captions are too small, and the B-roll covers the host
while she is speaking. Please fix those issues and show me the mock again.
```

The Agent edits the source, reruns the relevant checks and returns an updated mock.

## 6. Approve and submit the paid Build

<video controls playsInline preload="metadata" width="100%" src="./quickstart/videos/approve_and_submit_the_paid_build.mp4"></video>

Only after you explicitly approve the mock should you ask for the paid Build:

```text
The mock is approved. Submit the paid Build and create the final video.
```

The Agent summarizes every selected Provider, credential source, expected external work and estimated
cost before it starts, then waits for your approval. It submits the Build only after approval, follows
its progress and reports any Provider or Runtime issue in plain language. A paid Build is the step that
performs the real generation, media processing and final rendering; the earlier mock does not silently
trigger those billable operations.

## 7. Review the paid result

<video controls playsInline preload="metadata" width="100%" src="./quickstart/videos/review_the_paid_result.mp4"></video>

When the Build finishes, the Agent opens the resulting video and provides the saved output. Watch
the final result, not only the Studio mock. Real generated shots can differ from their mock
stand-ins, so check the generated host, B-roll, audio, captions, transitions, framing and export
quality. If the result needs a correction, tell the Agent what to change. It will revise the source
and guide you through another review rather than asking you to edit the rendered MP4 by hand.

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
keep, and shows a new mock before another paid Build.

## 9. Create multiple variants in parallel

<video controls playsInline preload="metadata" width="100%" src="./quickstart/videos/create_multiple_variants_in_parallel.mp4"></video>

When you want several versions, first tell the Agent the dimensions that may vary. It will discuss
the intended directions with you, for example:

- one version with a different host;
- one version translated into Spanish;
- one version with a product-focused opening;
- one version with faster cuts and denser B-roll.

The Agent confirms the shared parts and the allowed differences before starting. Once you approve the
directions, it creates a separate project scope for each variant and dispatches child Agents to work
in parallel. Each child keeps the agreed boundaries, checks its own layout and source, and reports
back to the main Agent. You receive a clear list of completed variants and any decision that still
needs your input; you do not have to coordinate the child Agents yourself.
