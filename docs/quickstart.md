---
title: Quickstart
description: Create, review and ship Hypit videos from a Coding Agent without writing SVML or SVS by hand.
---

# Quickstart for Agent users

You do not need to know SVML, SVS, JavaScript or the command line to make a video with Hypit.
You describe the result you want to a Coding Agent in ordinary language. The Agent uses the
`/hypit` skill to prepare the project, inspect the available components, create or reconstruct the
video program, and show you a reviewable Studio mock before anything billable is built.

This page is for people who want to direct a video, not implement its source code. Hypit keeps the
source editable and reproducible, but the Agent is responsible for writing and checking it. If you
want to author SVML or SVS yourself, begin with the second page, [Script](./quickstart/script.md),
after you understand the Agent workflow below.

## What you need

- A Coding Agent that can use skills, such as Claude Code or Codex.
- A folder where the Agent can create your video project.
- A reference video or your creative brief, if you are making an original video.

You do not need to clone the Hypit repository. Install the reusable `/hypit` skill with the command
in Step 1; the Agent can then prepare the Hypit Distribution for you. When a setup command is
necessary, the Agent explains what it does and runs it in the project directory.

## 1. Install the Hypit skill

Start a conversation with your Coding Agent in the folder where you want the project to live. Install
the Hypit skill once with:

```bash
npx skills add hypit-ai/hypit -g
```

The `-g` option makes the skill available to new Agent sessions in any project folder. You do not
need to clone the Hypit repository or understand the files this command installs. Once the skill is
available, start a new Agent conversation in your video project folder and continue with the steps
below.

## 2. Describe the video you want

You can take either of two paths.

### Clone a reference video

Ask the Agent to clone a video and provide the file path. You can drag the video file into the
Coding Agent window; most agents insert its path for you. You can also write the path explicitly:

```text
/hypit clone this video: /path/to/video.mp4
```

Tell the Agent what should change, if anything: the host, language, product, aspect ratio, visual
style or call to action. The reference is treated as evidence about the editorial structure. The
Agent does not merely summarize it; it creates an editable program that can be reviewed and built.

### Create an original video

You can describe an idea just as you would brief a human producer. For example:

```text
Create a ranking video using the ranking board below. Put Hypit in S tier and explain its advantages.
Also include Arcads, Higgsfield, Seedance and CapCut. Give each competitor a fair, concise summary
of its strengths and weaknesses. Make the result clear, energetic and suitable for a short social video.
```

You can add any constraints that matter to you: target audience, duration, language, tone, brand
colors, presenter, platform or aspect ratio. You do not need to decide which package, model,
caption system or animation primitive implements those choices. The Agent turns the brief into a
complete plan and asks follow-up questions only when a creative decision cannot be inferred safely.

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

After you approve the brief, the Agent works through the project without requiring you to write
source code. The exact sequence depends on the video, but it generally includes:

1. **Breaking the request into shots.** The Agent identifies the spoken sections, visual beats,
   transitions, captions, B-roll opportunities and any persistent elements such as a ranking board.
2. **Analyzing the reference or brief.** For a clone, it uses Gemini and the available media tools to
   inspect timing, composition, text, speakers and visual continuity. For an original, it resolves
   the same questions from your description and the selected creative direction.
3. **Asking narrow questions.** Instead of making you fill out a long form, it asks small,
   answerable questions such as which language to use, whether a product should appear on screen,
   or which host style to prefer.
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

This is why the workflow can feel like directing a small production team: the Agent handles shot
cuts, Gemini analysis, package discovery, source authoring, mock comparison and repairs. You are
not expected to open an editor, write a component, or run a sequence of build commands yourself.

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

The Agent edits the source, reruns the relevant checks and returns an updated mock. You review the
result again; you do not need to locate the corresponding SVML line.

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
keep, and shows a new mock before another paid Build. You can also ask it to use a different host
service or Runtime Profile when that is supported by your project; the Agent explains any new
credential or cost requirement first.

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
