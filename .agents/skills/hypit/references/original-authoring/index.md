# Making a video from a description

This route produces a complete video program from what the author says they want: `main.svml`,
`recipes.svs`, `build.svrun` and the `hypit.runtime.json` that binds what they demand — wired, then
built in rounds until there is a delivery.

The counterpart route is `../reconstruction/index.md`, which starts from a video to copy. Everything
between the two — what a picture is, what one generation owes another, which package owns an element,
how a Build is staged — is the same work and is written once, in the files this page links. This page
owns the order, and nothing else.

## What this route delivers, and what it does not

Unlike reconstruction, this route **does spend**. It generates pictures, takes, speech and a render.
What it does not do is spend them all at once: `../playbooks/craft/production-gates.md` stages the
work so that an unreviewed expensive output cannot silently feed a later Operation, and the delivery
Build is the last thing that happens, not the first.

There is no reference to check against, so the two things a reconstruction gets for free have to be
decided deliberately here: what the program is *for*, and what every appearance value *is*. Neither
has an evidence file to consult. Write them down rather than discovering them at render time.

## A description is the whole request

The author gives what the video should be — its subject, its length, its audience, who is in it, what
it says. That is theirs. The working directory, the project location, which packages to use, which
generator, which model tier and how many takes are **yours to decide rather than to ask for**;
`../playbooks/craft/generated-dependencies.md` states this for generators and it holds for the rest.

Ask about the video and nothing else. What is missing from a description is usually the duration, the
aspect ratio and the language — ask those together, once, and not one at a time.

Everything else this route needs is discoverable:

- **Where you are, and what is installed.** `../environment.md`.
- **Credentials.** `../credentials.md` lists which variables each Provider needs.
- **Where the project goes.** Its own directory in the checkout: `projects/<name>/`, named after the
  video. `../runtime.md` keeps the project and package boundaries distinct.

## Before deciding anything

1. Every craft file listed in the first item of `../playbooks/index.md`'s required load order — the
   ones it marks always-read — complete, in the order it gives them. That list decides which files,
   and it grows: one added there is required here from the moment it is added. Restating the set on
   this page is what once left a required craft file reachable from one route and invisible to the
   other, so this page does not restate it.
2. The format. `../playbooks/index.md` lists them; read the one that fits and only the additional
   craft files its own footer names.
3. `../vocabulary.md` — which installed packages own the systems this program contains, and whether
   any of them is genuinely missing. A system you never inspected is a system you are about to
   invent, and inventing one here is easy: there is no reference to contradict you.

## Write the Script, then the sources

`../authoring.md` is the syntax authority and names the checks. The Script comes first and the shots
come out of it, not the other way round: a Segment is what the Spine binds one Take to, so how the
Script is cut decides how many generations there are and where the seams fall —
`../playbooks/craft/generated-dependencies.md` says why over-splitting manufactures seams nobody
asked for.

Write all four files before building any of them. The Runtime Profile is part of the deliverable, not
an afterthought — `../runtime.md` says how to author one.

## Check it, then prove it is wired

`../authoring.md`'s check set proves the sources are legal. That is not the same as the graph tracing,
and neither is bounded by any attempt ceiling: `../preview.md` proves the Run traces before a Provider
is ever reached, and a graph that does not trace is not done.

## See it before you pay for it

`../preview.md` again: one element rendered to a still locally, or the whole Run opened in Studio for
the author. Both are free. Looking at a composition before generating into it is the cheapest review
in the sequence.

## Generate in rounds

`../playbooks/craft/production-gates.md`, Gates 1 through 4 in order. Pictures are accepted before
takes reference them; takes are accepted before they are assembled; the delivery is demanded last and
watched and measured whole.

Gate 4 ends the job — and ends with the question of whether a component built along the way should
outlive this one video. `../local-author-package.md` says how to judge that and what promoting it
actually costs.

## When a step outgrows this page

This directory holds one file today, because every step above already has a home to link to. That is
the intended shape, not an unfinished one. **When a step here grows past three sentences that are not
links, its content belongs in a file of its own, or in the shared file it should have linked** — the
disease this route was split out to cure is whole-job knowledge accumulating in one place where only
one route can find it.
