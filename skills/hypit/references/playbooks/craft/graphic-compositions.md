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
- **Drawn structure** is what the composition computes: text content, exact font, size, weight, line
  height, spacing, alignment, colour, stroke colour and width, shadow colour, offset, blur and
  opacity, glow, emphasis or active-item treatment, frame geometry, borders, corner radius, padding,
  stack order, placement, and reveal or typing rhythm.

  That list is also the checklist for accepting a package: `../../vocabulary.md` requires every one of
  these that changes what the viewer sees to be resolved before a component is chosen, and a property
  with nowhere to land in the declared vocabulary is what makes a gap.

Never bake drawn structure into generated material. A generated picture of text cannot be re-timed,
re-read or corrected, and its wording drifts. A card, inset, phone, browser or screenshot element is
not one picture: its inner picture is material, its frame and entry are structure.

### A page scrolling inside a frame is a frame that does not move

The frame and its inner picture are two things, so they move independently, and the one that is moving
has to be named. A screen recording — a phone app being scrolled, a browser page running past, a
document paged through — is **a frame sitting still while its contents travel**. The device stays
exactly where it is: same position, same size, same corner radius, same edge, frame after frame.

Read the wrong way round, this becomes an element that slides up and down the canvas, and that is the
misreading to watch for: nothing in the reference translated, and the reconstruction has a phone
sliding about the screen. The evidence separating them is the frame's own edge. Track the border,
the corners and the outer rectangle across the stretch: if they hold their position, the frame is
fixed and everything that moved was inside it.

Author it that way. The frame is a fixed `space:Frame` at the position and size the reference holds it
at, and the inner picture is **one still image** of the page, placed inside it. Do not generate a video
of a scrolling page and do not animate the inner picture past the frame: a still of the page at the
moment the reference dwells on is what the viewer reads, it is fully controlled, and it costs one
image. `generated-dependencies.md` says the same thing from the take side — a stretch whose picture
does not move is authored as a still rather than asked of a video model.

What is worth reproducing is any state the reference shows and the still cannot: a selected row, a
badge, a check mark. Those are drawn structure over the still, on the words where the reference shows
them, rather than a reason to make the whole thing move.

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

The two are also *obtained* differently, and this is where the line is most often crossed. A
component draws its own chrome in code: its Surface, Producer and Fragment render the paper, board,
panel or backdrop, and the preview image its Surface owes is captured from that rendering.
Source-supplied material is **declared in the Source as a generation** — `<gpt:Image prompt={…}/>`
fed by a `copy:Value` that holds its description — so the picture and the words that produce it live
together and can be reread, corrected, planned and rebuilt through `hypit plan` and `hypit build`.
Generating that material yourself and pointing `media:Image src=` at the file throws the description
away and leaves a picture nobody can regenerate; `media:Image` is for material the author already had.

Never make a component's own surface a required input, and never make it a generated raster either.
A component whose chrome arrives from the graph cannot render on its own, cannot produce the preview
image its Surface owes, and forces every project that installs it to obtain a picture that was never
theirs to choose. A component whose chrome is an image-model texture committed into the package
cannot be adjusted, themed or regenerated by anyone who did not run that generation. If you find
yourself writing a Run Source whose only purpose is to produce a component's own texture, or reaching
for an image model to make one, the chrome is in the wrong place: draw it in the component.

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
  listing `../../vocabulary.md` documents exists for finding a capability you did not know was there,
  not for confirming a familiar one.
- Static material is generated as an image. Generate video only when the element is a moving depicted
  scene.
- Generate one material per depicted thing, at the aspect ratio it will be used at, carrying only
  what it depicts. Keep captions, labels, arrows, badges and titles out of the prompt; the
  composition draws those.
- Pin accepted Records for reuse. `../../authoring.md` says how a Record is named in the Run Source.
