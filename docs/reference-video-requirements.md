---
title: Reference-video requirements
description: Every requirement stated for reference-video reconstruction, and where each one lives.
---

# Reference-video requirements

Every requirement stated for reconstructing a reference video, with where it is enforced and whether
it is done. Paths are relative to the repository root. `skill/` abbreviates
`.agents/skills/hypit/references/`.

## Shots, continuity and ownership

| # | Requirement | Where | Done |
|---|---|---|---|
| 1 | An overlay continuing across a cut stays one visual track over its whole life; it is not re-added per shot | `skill/reference-video/continuity.md` | ✅ |
| 2 | Consecutive shots that are really one camera shot merge when the combined length is at most fifteen seconds, preserving order and sound continuity | `skill/reference-video/continuity.md` | ✅ |
| 3 | Three consecutive shots get their own continuity review | `reference-video-tools` three-shot window | ✅ |
| 4 | Every shot observation carries the previous shot's tail frame, to judge whether the picture continues | `reference-video-tools` `tail_frame_ref` | ✅ |
| 5 | Every shot observation carries the previous shot's audio tail, so a picture cut is not mistaken for a sound cut | `reference-video-tools` `audio_tail_ref` | ✅ |
| 6 | B-roll that covers the whole frame is still B-roll — being on top or filling the frame does not make it the base | `reference-video-tools` picture prompt | ✅ |
| 7 | Whoever is speaking owns base, not whoever is lowest or largest; picture ownership and sound ownership are judged separately | `skill/reference-video/continuity.md` | ✅ |
| 8 | A silent B-roll person whose mouth moves does not take over speaker, sound or base | `skill/reference-video/continuity.md` | ✅ |
| 9 | A shot with nobody visible can carry continuing off-screen speech | `skill/reference-video/continuity.md` | ✅ |
| 10 | Alternating, overlapping and simultaneous speech are decided by sound, not by who is on screen | `skill/reference-video/continuity.md` | ✅ |
| 11 | People and voices are identified once for the whole reference and matched to each other | `reference-video-tools` whole-reference passes | ✅ |
| 12 | The promoted product is described once and reused; no per-shot redescription and no contradictions | `skill/reference-video/continuity.md` | ✅ |

## The four questions this round opened with

| # | Requirement | Where | Done |
|---|---|---|---|
| 13 | A card whose inner picture does not exist must have it generated, not silently dropped | `skill/playbooks/craft/graphic-compositions.md` | ✅ |
| 14 | Text appearance — stroke, shadow, font, spacing — is resolved from evidence; a default value is not an observation | `skill/reference-video/vocabulary.md`, per-shot type observation | ✅ |
| 15 | A caption system spanning the video is one Program, Track and Style, read from a whole-reference observation rather than inferred per shot | `skill/reference-video/continuity.md`, `persistent_systems` | ✅ |
| 16 | None of this hardcodes one package's features | superseded — see #29 | ⚠️ |

## The hard rule

| # | Requirement | Where | Done |
|---|---|---|---|
| 17 | A base picture is a depicted scene. A designed field — paper, board, gradient, backdrop — is never a base, however convincing | `skill/playbooks/craft/graphic-compositions.md` | ✅ |
| 18 | A full screen of designed field carrying authored content is one component that owns its own background, never generated base plus text track | same | ✅ |
| 19 | A component's own surface is a file inside the package, produced outside the graph | `skill/local-author-package.md`, `hypit image` | ✅ |
| 20 | The Typewriter family is removed, so the gap it filled is real | `packages/ranking` | ✅ |

## Generated things that must match

| # | Requirement | Where | Done |
|---|---|---|---|
| 21 | Two generated things that must match are wired, not described twice | `skill/playbooks/craft/generated-dependencies.md` | ✅ |
| 22 | A location is generated once; other views derive from that image; every take references the view it belongs to | same | ✅ |
| 23 | A shot split by the duration ceiling opens on the previous part's last frame | same | ✅ |
| 24 | A voice is generated once and feeds every line and every take | same | ✅ |
| 25 | A stretch shorter than the generator's floor is never its own take: folded when the picture moves, held as stills when it does not | same | ✅ |
| 26 | A take never starts from a prompt alone | same | ✅ |
| 27 | Images generate in rounds, since a derived view cannot be demanded before the image it derives from is accepted | `skill/playbooks/craft/production-gates.md` Gate 1 | ✅ |
| 28 | Photographic prompts open with the reality contract verbatim; drawn assets do not | `skill/playbooks/craft/image-prompt-style.md` | ✅ |

## Choosing a generator

| # | Requirement | Where | Done |
|---|---|---|---|
| 29 | Rules name the good choice directly and do not send the agent surveying what is installed | `skill/playbooks/craft/graphic-compositions.md`, `skill/reference-video/vocabulary.md` | ✅ |
| 30 | The inferior alternative is not mentioned | no `nano` in the skill tree | ✅ |
| 31 | The agent never stops to ask the author which generator to use | `skill/playbooks/craft/generated-dependencies.md` | ✅ |
| 32 | Listing installed packages is for finding a capability you did not know existed, not a step before known work | `skill/reference-video/vocabulary.md` | ✅ |

## The observer

| # | Requirement | Where | Done |
|---|---|---|---|
| 33 | The model returns natural language only; it never sees SVML, package declarations or component names, and never writes them | all observation instructions | ✅ |
| 34 | Comparison is blind: it is never told which image is the reconstruction or what was built | `compare_reconstruction` | ✅ |
| 35 | A narrow question costs one request and does not disturb cached observations | `observe_reference --question` | ✅ |
| 36 | Reference frames are used for comparison only; they never feed generation | `skill/reference-video/reconstruction-loop.md` | ✅ |
| 37 | The reference side is never re-observed to resolve doubt; `--reobserve` exists for rebuilt media | same | ✅ |

## Scope

| # | Requirement | Where | Done |
|---|---|---|---|
| 38 | Reconstruction produces the component, `main.svml`, `studio.svs` and `build.svrun`; it declares generations rather than running them | `skill/reference-video/` | ✅ |
| 39 | A component's own asset is the exception and is generated while authoring the package | `skill/local-author-package.md` | ✅ |

## Notes on two entries

**#16** was stated early and reversed later. The installed model packages are a standard library, so
rules name `gpt:Image` directly rather than sending the agent to rediscover it. What survives of the
original intent is #29 through #32: no selection procedure, no inferior alternative, no interrupting
the author.

**#25** was originally stated as a three-second floor. The declared minimum is four seconds for most
models, and one model accepts a different range entirely, so the rules name the selected model's
declared range instead of any literal.
