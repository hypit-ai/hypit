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

## Missing material must be generated

- Source depicted material in this order: material supplied for the task or already in the project;
  an Artifact the project already produces; otherwise generation.
- If a required picture does not exist, generating it is mandatory. Do not substitute flat colour, an
  empty frame, a placeholder, a stand-in borrowed from elsewhere, or a silently emptied element. A
  picture inside a card is part of the work, not decoration.
- Choose the generating package by inspecting what is installed at that moment: read the declared
  inputs, outputs and Recipe properties of every installed package whose declared output is the
  required media type, then choose. Never assume a package name from memory or from another project,
  and never write a tag before its declaration has been read.
- Static material is generated as an image. Generate video only when the element is a moving depicted
  scene.
- Generate one material per depicted thing, at the aspect ratio it will be used at, carrying only
  what it depicts. Keep captions, labels, arrows, badges and titles out of the prompt; the
  composition draws those.
- Pass every generated image through the image gate in `production-gates.md` before connecting it
  downstream, and pin accepted Records for reuse.
