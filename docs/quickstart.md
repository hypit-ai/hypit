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

Once you submit the brief, the Agent works through the project automatically without requiring you to
write source code. It does not ask questions during production; wait for the Studio mock. The exact
sequence depends on the video, but it generally includes:

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
7. **Comparing against a mock.** It produces mock media for unbuilt generations, renders the complete
   composition in Studio, compares what it sees with the reference or brief, and repairs issues such
   as incorrect timing, hierarchy, cropping, captions or visual density.

## 5. Review the mock Studio

When the first pass is ready, the Agent opens a Studio mock for you. A mock is a review version: it
uses deterministic stand-ins for media that has not been generated yet, while preserving the real
timing, layout, captions, transitions and track relationships. It is intended to answer “does this
video work?” before you pay for the final media and rendering.

Watch the mock from beginning to end. Check the story, the order of the shots, the readability of
captions, the prominence of the ranking board or product, the rhythm of B-roll, and whether the
overall tone matches your brief. If something is wrong, describe the problem in ordinary language:

```text
The board appears too late, the captions are too small on a phone, and the B-roll covers the host
while she is speaking. Please fix those issues and show me the mock again.
```

The Agent edits the source, reruns the relevant checks and returns an updated mock.

## 6. Approve and submit the paid Build

Only after you explicitly approve the mock should you ask for the paid Build:

```text
The mock is approved. Submit the paid Build and create the final video.
```

The Agent summarizes the selected models, expected external work and estimated cost before it starts.
It then submits the Build, follows its progress and reports any provider or runtime issue in plain
language. A paid Build is the step that performs the real generation, media processing and final
rendering; the earlier mock does not silently trigger those billable operations.

## 7. Review the paid result

When the Build finishes, the Agent opens the resulting video and provides the saved output. Watch
the final result, not only the Studio mock. Real generated shots can differ from their mock
stand-ins, so check the generated host, B-roll, audio, captions, transitions, framing and export
quality. If the result needs a correction, tell the Agent what to change. It will revise the source
and guide you through another review rather than asking you to edit the rendered MP4 by hand.

## 8. Request natural-language changes

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
