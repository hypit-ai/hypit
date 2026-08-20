# Graphic compositions and material

This file decides what a picture *is* before anything decides which component draws it. It applies to
original authoring and to reconstruction equally.

## A base picture is a depicted scene

- A base picture is a depicted scene: a place, a person, an object, or a world with its own space,
  light and camera. Live action and animation both qualify — a drawn or rendered world is a scene.
- A designed graphic field is never a base picture. Ruled or gridded paper, document sheets, flat or
  gradient colour, blurred wallpaper, boards, canvases, panels and slide backdrops exist so that
  authored elements can sit on them. They are the surface of a composition, not a place.
- Judge by what the surface is *for*, not by how convincing it looks. A photographed desk with a real
  notebook on it is a scene. A full screen of paper that exists only so words can appear on it is a
  graphic composition, however good the paper texture is.
- Never send a designed field to a video generation model as a shot, and never author one as a base
  Track. A scene generator asked for a backdrop returns unreproducible footage in place of content
  you could have timed, edited and corrected.

## A full-screen graphic composition is one component

- When the whole picture is a designed field carrying authored content — a list, a ranking, a
  leaderboard, a chart, a score, a quiz, a code sheet, a card wall, a title board — that whole
  picture is one self-contained composition. It owns its background surface, its elements, its
  reveal and its motion.
- Author it as one component that owns all of it. Never as a generated base plus a separate text or
  overlay Track: that split makes the background unreproducible and scatters one visual system
  across unrelated tags with no shared timing.
- Text drawn over a depicted scene stays an overlay on that scene. Only a picture whose entire field
  is designed becomes a composition of its own. A framed graphic occupying part of a scene is an
  inserted element, and the same ownership rule applies inside its frame.
- **A designed field is still one composition when it covers only part of the frame.** A ranking
  down the left third, a leaderboard across the bottom half, a scoreboard band over a live shot —
  each is a designed field carrying authored content, and each is one component that owns its own
  surface, its rows and its reveal, sitting on a Frame that is not the whole Canvas. It does not
  become an overlay because it is small, and it does not need a visible border or card edge to be a
  field: a slab of colour holding rows is a surface. The question is never how much of the frame it
  covers, but whether what it covers is designed or depicted.
- If no installed package owns the composition, that is a real vocabulary gap. Read
  `../../local-author-package.md` and build the package. Do not approximate it with tags that own a
  different role.

## Material and structure are sourced differently

Every visible thing is either depicted material or drawn structure.

- **Depicted material** is what a picture must show: scenes, people, products, textures, paper and
  backdrop surfaces, artwork, screenshots, and any picture sitting inside a frame, card, device or
  inset.
- **Drawn structure** is what the composition computes: text content, exact font, size, weight,
  spacing, alignment, colour, stroke, shadow, glow, frames, borders, corner radius, padding, stack
  order, placement, reveal order and timing.

Never bake drawn structure into generated material. A generated picture of text cannot be re-timed,
re-read or corrected, and its wording drifts. A card, inset, phone, browser or screenshot element is
not one picture: its inner picture is material, its frame and entry are structure.

## A component's own surface belongs to the component

Depicted material divides again, and getting this wrong produces a component that cannot draw
itself.

- **Component-owned surface** is the chrome a composition always shows: its paper, board, panel,
  ruled lines, grain, texture, default backdrop. It is part of the component's identity. It ships
  **inside the package as an ordinary file**, exactly as the package's preview image does, and is
  read with `readFile(new URL("../assets/…", import.meta.url))`.
- **Source-supplied material** is content that differs between videos: photographs, screenshots,
  thumbnails, product shots, character images.

The test is one question: **would two different videos using this component show the same picture
there?** If yes, it belongs to the package. If they would show different pictures, it is an edge the
source supplies.

The two are also *obtained* differently, and this is where the line is most often crossed. The
component's surface is generated once while the package is authored, with `hypit image`, and
committed inside the package — it is authoring input. Source-supplied material is **declared in the
Source as a generation** — `<gpt:Image prompt={…}/>` fed by a `copy:Value` that holds its
description — so the picture and the words that produce it live together and can be reread,
corrected and rebuilt. Generating that material yourself and pointing `media:Image src=` at the file
throws the description away and leaves a picture nobody can regenerate; `media:Image` is for material
the author already had.

Never make a component's own surface a required input. A component whose chrome arrives from the
graph cannot render on its own, cannot produce the preview image its Surface owes, and forces every
project that installs it to obtain a picture that was never theirs to choose. If you find yourself
writing a Run Source whose only purpose is to produce a component's own texture, the texture is in
the wrong place: generate it once while authoring the package and commit the file.

Produce that file with `hypit image --prompt <text> --to <path>`, which writes a picture and nothing
else. A package asset is authoring input, not the output of anybody's video, so it is never a Target
and never a Record.

A package is installed vocabulary. `.svml`, `.svs` and `.svrun` are documents that use it. A package
that needs one of those documents in order to draw itself has inverted that relationship.

## Missing material must be generated

- Decide first whether the picture is component-owned surface or source-supplied material. A
  component's own surface is generated once while the package is being authored and committed as a
  file inside it; the rest of this section is about source-supplied material.
- Source depicted material in this order: material supplied for the task or already in the project;
  an Artifact the project already produces; otherwise generation.
- If a required picture does not exist, generating it is mandatory. Do not substitute flat colour, an
  empty frame, a placeholder, a stand-in borrowed from elsewhere, or a silently emptied element. A
  picture inside a card is part of the work, not decoration.
- Generate it with `gpt:Image`, reading that package's README for its ports. Surveying what is
  installed before doing something you already know how to do costs time and buys nothing; the
  listing exists for finding a capability you did not know was there, not for confirming a familiar
  one.
- Static material is generated as an image. Generate video only when the element is a moving depicted
  scene.
- Generate one material per depicted thing, at the aspect ratio it will be used at, carrying only
  what it depicts. Keep captions, labels, arrows, badges and titles out of the prompt; the
  composition draws those.
- Pass every generated image through the image gate in `production-gates.md` before connecting it
  downstream, and pin accepted Records for reuse.
