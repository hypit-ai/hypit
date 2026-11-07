---
title: Generated media and the edit
description: Keep generation execution separate from accepting media into an NLE project.
---

Hypit can describe and execute image, video and speech generation through Author Sources, Models,
Providers and Runtime Profiles. That execution graph answers a different question from the NLE:
what should be produced, by which selected capability, and with which retained Result?

The NLE answers where accepted material appears, how it is trimmed and how picture, audio and effects
combine. It never reruns a model or keeps a live dependency on a generation request.

## Generate and inspect

Select the desired Author output as a Build Target:

```bash
hypit plan main.svml --target opening.video
hypit build main.svml --target opening.video --follow
```

Model and Provider choices remain in the Author Source and Runtime Profile. The Build Result keeps the
execution record and produced output according to the owning package's retention policy.

## Accept the result as material

When a take belongs in the edit, export that exact Result to an ordinary project file:

```bash
hypit result export <build-id> --output opening.video --to assets/opening.mp4
```

Import the file as a Media Asset document, then materialize one media-bin entry and Item into the NLE
project. A frontend drag-and-drop action and an Agent using the file APIs perform the same kind of
revisioned edit. Neither needs a queue inside the NLE document.

The Media Asset manifest records stable interpretation facts and can refer to optional package-owned
representations. It does not record that the file came from Seedance, a camera, a download or another
tool. This is how accepted media becomes source-agnostic.

## Make another take

Generating a new take creates a new Result. It does not silently replace the file or Item already
accepted into the edit. The author chooses whether to import it, replace a media reference or keep both
versions. Existing placement and effect parameters remain ordinary NLE edits.

See [Targets and Builds](./run.md) for execution and [NLE project structure](./tracks.md) for the saved edit.
