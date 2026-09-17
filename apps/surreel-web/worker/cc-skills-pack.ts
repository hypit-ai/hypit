/* Generated from /home/deck/work/surreel-cc/skills. Do not edit. */
export const ccSkillsPack = {
  "ad-story-framework": {
    "name": "ad-story-framework",
    "description": "Ads that do not feel like ads: build the video around a character people want to watch, give them a belief, tell a story, and let the product enter as part of the story with a single soft call to action at the end. Use for product videos, brand spots, supplement or DTC ads, founder-story ads, launch teasers, or any brief that says \"make an ad\" or \"sell this\", especially when the user does not want it to look like an ad.",
    "kinds": [
      "video"
    ],
    "plannerText": "# Ads that barely feel like ads\nFranky Shaw's framework, as shown in the \"Earl\" ad (transcript in `references/example-earl-ad-transcript.md`, filmstrip in `assets/earl-ad-filmstrip.png`): attention first, advertising second.\n1. **Start with a character people want to watch.** A person with a strong, simple worldview and a distinct voice. Earl is an old rancher at a livestock auction; the interviewer is a wellness-optimizer with a clipboard. The contrast is the comedy.\n2. **Give them a belief.** Earl's belief: \"you fellers keep buying what life used to hand you: food, sunlight, moving around.\" Every answer restates it in fewer words (\"Red light therapy?\" \"Sun.\" \"Recovery protocol?\" \"Sunday.\").\n3. **Build a story around the belief.** A conversation with escalation: rapid questions, one-word answers, then a turn (\"Let me show you one more thing\"). Keep the rhythm tight; dead air kills it.\n4. **Let the product become part of the story.** The product appears late and inside the belief: the one capsule that replaces the stack. It is judged by the character's rule (\"That's more like it\"), not by claims.\n5. **Advertising last.** One line of plain benefit and one soft call to action after the story is done (\"Over one hundred minerals in every capsule. Because men have better things to do. Click learn more below.\").\n## Writing the script\n- Write the belief in one sentence first. Everything the character says should be derivable from it.\n- Interview format is the cheapest structure: alternating question and answer, each answer shorter than the question.\n- Give the character one physical setting that proves the belief (ranch, kitchen, workshop) and one prop for the turn.\n- End the story before the pitch. The pitch is a separate, calmer shot.\n## Producing it with the primitives\n- Split the script into 4-8 second shots, one exchange each. Generate each shot with Seedance 2.5 reference-to-video using one still per character (gpt-image-people skill) so faces hold across cuts. Keep the camera static or lightly handheld; it is a conversation, not an action film.\n- Put dialogue in the prompt with the speaker and delivery (\"Earl, flat and unhurried, says: ...\") and ask for `generate_audio`. Where the model mangles a line, re-generate that shot only.\n- Assemble with `edit.render`: hard cuts on the exchanges, no transitions, plain-font captions if the platform is silent-autoplay"
  },
  "gpt-image-people": {
    "name": "gpt-image-people",
    "description": "Photoreal people stills with GPT Image 2.5 on fal (flare for speed, sunburst for fidelity) written as a structured JSON spec: camera, lens, lighting with catchlights, skin texture, hair behaviour, face, outfit, pose, selfie perspective, post-processing, and photography rules that forbid plastic skin. Also the \"vertical 3x3 failed photos\" contact-sheet trick for candid variety. Use whenever a brief needs a realistic person, creator, influencer, character reference, first frame for Seedance or H3, portrait, selfie, or \"make the person look real\".",
    "kinds": [
      "image"
    ],
    "plannerText": "# GPT Image 2.5 people\nEndpoints: `openai/gpt-image-2.5/flare/text-to-image` (default, fast, natural lighting and textures) and `openai/gpt-image-2.5/sunburst/text-to-image` (slower, more fidelity on intricate detail). Each has an `/edit` sibling for image-to-image. Inputs: `prompt`, `image_size` (`{width,height}` multiples of 16, or a preset), `quality`, `num_images`, `output_format`, `background`. Confirm with `fal.schema`.\n## Write the prompt as a spec\nThe example in `references/example-selfie-json.md` is a complete JSON object that produced a convincing handheld selfie. Send it as the prompt text. Its sections, and why each exists:\n- **meta**: aspect, \"ultra_photorealistic\", the capture device and lens (\"Smartphone front-facing camera, 24mm equivalent, f/2.2\"), capture style. Naming the device sets distortion, depth of field and noise for free.\n- **scene, environment**: a plausible ordinary place, background elements as a list, a foreground element crossing the frame (earphone cables), lighting with source, direction, colour temperature, the catchlight shape in the eyes, where shadows and specular highlights fall. Catchlights and nose-tip highlights are what make skin read as photographed.\n- **subject**: skin tone, texture (\"dewy, natural pores visible on nose and cheeks\"), visible imperfections (blush, freckles, flyaways, frizz), hair behaviour, face shape and expression, eye direction, makeup as products. Imperfections are the realism.\n- **outfit and accessories** as garments with fabric and fit; jewellery named.\n- **pose**: body, arms, hands doing one specific thing (\"lightly grasping the earphone cable just below the mic\"), head tilt, a micro-action.\n- **camera_perspective**: POV, angle, framing, distance, depth of field, and imperfections (\"slight wide-angle facial distortion typical of front cameras\").\n- **post_processing**: editing level, grade, contrast, saturation where, retouching that \"retains specular highlights and some pore texture\".\n- **photography_rules**: `no_cgi`, `no_plastic_skin`, `no_exaggerated_anatomy`, `hyper_realistic`, `reproduce_exact_scene`.\n## Candid variety: vertical 3x3 failed photos\nAsk for \"Vertical 3×3 failed photos × {character}\": a contact sheet of nine mis-timed, blurred, half-framed shots of the same person. It yields natural poses and expressions you would never get by asking for a good photo, and the same identity"
  },
  "h3-video": {
    "name": "h3-video",
    "description": "MiniMax H3 (H3 Max Turbo on fal) video direction, in two registers: kinetic motion-graphics trailers with a locked character, per-cut timing and beat-synced typography, and narrative shots with emotional performance that actually renders (one beat per shot, camera placed where the character looks, transitions hidden in blinks). Use whenever H3, Hailuo, MiniMax, a character reveal, kinetic type, a music-app style promo, a 13-cut trailer, or \"the face looks frozen / wooden\" comes up, and for any shot breakdown with acting.",
    "kinds": [
      "video"
    ],
    "plannerText": "# H3 video\nH3 is the fast lane: `minimax/h3-max-turbo/image-to-video` and `.../text-to-video` on fal (`minimax/h3-max/*` is the slower, higher-quality tier with `reference-to-video`, `director` and `camera-controls` endpoints). Read `fal.schema` for the exact fields before the first call. Two things it is unusually good at, each with a reference file:\n- **Kinetic graphic trailers**: flat colour fields, slamming UI chrome and typography, a stylised character doing parkour through the letters. Read `references/example-play-trailer.md` (verbatim 13-cut prompt) and look at `assets/play-trailer-filmstrip.png`.\n- **Narrative performance**: shots where a face has to do something. Read `references/performance-and-shots.md` before writing any shot with emotion; its rules were measured on real renders and most of them are counter-intuitive.\n## Writing a kinetic trailer\nStructure the prompt exactly like the example:\n1. **Header**: aspect, exact cut count, fps, total seconds (\"exactly 13 distinct cuts, 24fps, total 15.00s\").\n2. **CHARACTER (lock this design; never redesign)**: every visible attribute from the reference still (hair, eyes, expression, each garment with colour, materials, accessories) and \"preserve exact face, proportions, hairstyle, outfit, materials, accessories and colors in every frame.\"\n3. **Graphic language**: the ratio of design to action (\"80% bold graphic design in motion and 20% character action\"), the named vocabulary (window frames, title bars, equalizer bars, cursor arrows, CRT scanlines, vinyl stamps), a palette of four or five named colours, and the style triangulated by three references (\"AAA motion-graphics title sequence × streetwear campaign film × Windows-era media player\"). Say what it is not (\"not ice/frost/barcode-lock\").\n4. **CUT NN | start–end**: one per cut, about a second each, each compositionally different: a pure-graphics cut, an extreme close-up that shatters into tiles, a slide across the baseline of a word, a burst through a waveform tunnel, a jump through a ring of type, a vault over a word that springs, a backflip in three ghost frames, a kinetic-type barrage, a wall-run freeze with a stamp, a dive through shattering panes, a poster montage, a slow-motion hero landing with shockwave, an identity end card. Typography must be readable before the character overlaps it.\n5. **Editing**: the rhythm words (hard cuts on every"
  },
  "seedance-home-video": {
    "name": "seedance-home-video",
    "description": "Ultra-realistic \"someone just filmed their friend\" videos on Seedance 2.5: documentary handheld consumer-camera footage of one consistent person moving through real places over 20-30 seconds, with timed beats, physics rules, and environmental audio only. Use for day-in-the-life, personal-vlog, nostalgic home-video, slice-of-life, travel-diary, or \"make it feel like real found footage, not an ad\" briefs, even when the user just says \"make it look real\" or \"not cinematic\".",
    "kinds": [
      "video"
    ],
    "plannerText": "# Seedance 2.5 home-video realism\nThe look: an older consumer camera held by a friend. Slight shake, late reframes, autofocus hunting, exposure catching up between sun and shade, soft detail, mild motion blur, muted colours, imperfect white balance. No gimbal, no drone, no slow motion, no grade. Realism comes from imperfection and from small human moments, not from spectacle.\nRead `references/example-seoul-summer.md` before writing: it is a complete 30-second prompt that produced the filmstrip in `assets/seoul-summer-filmstrip.png` (rooftop drink, alley walk, missed basketball shot, corner shop, summer rain, walk home). Copy its structure, not its content.\n## Prompt structure that works\nWrite the prompt as labelled blocks in this order. Seedance reads the whole thing; the blocks keep you from forgetting the parts that sell realism.\n1. **Header line**: length, resolution, \"ultra-realistic documentary-style personal home video\", the ordinary situation, and the feel (\"spontaneous, intimate, imperfect, genuinely observed rather than performed\").\n2. **MAIN SUBJECT**: one person, age, look, hair, stubble or makeup, exact clothes and one accessory. End with \"keep face, identity, body proportions, hairstyle, clothing and appearance completely consistent from beginning to end.\" When a reference still exists, name it (`@Image1`) and describe it anyway so the model has words for consistency.\n3. **LOCATION**: a specific real kind of place, listed as concrete nouns (alleys, laundry lines, utility poles, parked bicycles). Say what must not appear: crowds, landmarks, brands, ads, commercial activity.\n4. **CAMERA / VISUAL STYLE**: the consumer-camera paragraph above, then a \"No\" list: stabilization, gimbal, drone, cinematic choreography, dramatic lighting, slow motion, commercial grading, polished cinematography.\n5. **Timed beats**: `00:00–00:05 — TITLE` blocks, 4-7 seconds each, one small action each (sit and sip, walk with hands in pockets, pick up a ball and miss, buy a drink, get caught in rain, catch breath, walk away). Include one camera imperfection per beat (\"the camera takes a moment to find focus\", \"briefly loses focus and recovers\"). Let the subject notice the camera once or twice and not pose.\n6. **PHYSICAL REALISM**: hands, feet, cloth, hair, rain and props behave; list the failure modes you refuse (extra fingers, floating objects, teleporting, objects"
  },
  "ugc-ad-formats": {
    "name": "ugc-ad-formats",
    "description": "Scripted UGC ads built from several references at once on Seedance 2.5 and similar reference-to-video engines — talking head, product promo, whiteboard explainer, app demo, two-person podcast, street interview, stage talk. Covers the reference contract (each reference owns exactly one axis and must not bleed into the others), second-by-second script segmentation that binds every line to a visible action, product grounding, voiceover vs on-camera, and continuity clauses. Use whenever a brief has a script, a product, a named format, a reference video to imitate, or more than one input image — and for any ad, testimonial, demo, explainer, or \"make this person say this while doing that\" request.",
    "kinds": [
      "video"
    ],
    "plannerText": "# Scripted ads from multiple references\nA talking-head video with one prompt and one image is a look problem. An **ad** is a control\nproblem: a specific person, saying specific words, doing specific things, on a specific beat,\nholding a product that must not change shape. The method below is how you keep all of that\n1. **Every reference owns exactly one axis, and is explicitly forbidden the rest.** A performance\n2. **Every line of script is bound to what is visible while it is spoken.** An unbound script\n## How much of this to read\n**This file is enough to write a good prompt. Read it, then start.** Everything load-bearing —\nthe reference contract, the pacing budget, the three expensive defects, the engine constraints —\n`skills.read` and never generated anything:\n- Open **at most one** reference file, and only when the brief raises that exact question.\n- **Never re-open** a file already read in this turn — it is still in context.\n- Do not read a second pack \"for completeness\". If `ugc-ad-formats` fits the brief, it is enough.\n- When you are unsure whether to read more: **write the prompt instead.** A prompt you can inspect\nbrief is), `product-integration.md` (a product must look physically present),\n## The five axes\nSeparate these before writing a word of prompt. Each gets its own source, and confusion between\nany two is the usual reason a generation is wrong in a way you cannot prompt your way out of.\n| Script and action | what is said and what happens | your timeline, never a reference |\n## Write the script to the clock first\n**About 20 characters per second, per segment** — roughly 200 words per minute, a natural talking\npace. A 10-second shot carries about 200 characters; a 20-second ad about 400. Count them before\n## The prompt skeleton\nWrite labelled blocks in this order. The order matters less than the labels; the labels stop you\nsilently dropping the block that was holding the shot together.\n1. **Header** — duration, aspect, how many cuts, real-time speed. `20-second vertical 9:16 UGC\n2. **Reference roles** — one paragraph per reference: what it controls, then what it must not\n3. **Scene** — the room as concrete nouns, the light source, where the character stands, what is\n4. **Camera** — position, height, framing, and whether it moves. If it is locked off, say locked\noff and say it never pans, tilts, zooms or reframes.\n5. **Performance** — the"
  },
  "ugc-realistic": {
    "name": "ugc-realistic",
    "description": "Phone-shot-looking AI UGC (user-generated content) with GPT Image 2.5 stills and Seedance 2.5 reference-to-video: realistic creators talking to camera, viral-hook remakes with a swapped person, product-in-hand testimonials, plain captions, and the four-layer check that decides whether a UGC video can hit a million views. Use for UGC, creator ads, TikTok or Reels talking-heads, AI influencers, \"make it look like a real person filmed this on their phone\", hook remakes, or any brief with a product and a person speaking.",
    "kinds": [
      "image",
      "video"
    ],
    "plannerText": "# Realistic AI UGC\nUGC works when it looks like a real person posted it on the spot. Everything here serves that: a believable still first, Seedance 2.5 to animate it against a proven reference, phone-camera language in the prompt, and basic captions.\nRead in this order: `references/viralops-workflow.md` (the still-to-video pipeline and reference-edit prompts), `references/example-prompts.md` (four field prompts), `references/viral-ugc-checklist-transcript.md` (what a UGC coach checks). Filmstrips of the results are in `assets/`.\n## The pipeline\n1. **Framing reference**: pick a casual photo with the framing, pose, angle and environment you want (a selfie in a kitchen, a haul on a sunlit driveway). It is a composition reference, not an identity to copy.\n2. **Creator still with GPT Image 2.5**: describe the reference back into a detailed prompt (the gpt-image-people skill has the JSON spec form), change the person, clothes and location, generate. A still that already looks AI will not be rescued by video; iterate here until `media.look` reports natural skin, catchlights and phone-lens distortion.\n3. **Concept**: angle, hook, script, video flow, in that order. The first line is a question or a bold claim; the first three seconds contain a visible movement (hands, a product, a gesture).\n4. **Pick the engine by what the still contains.** fal's Seedance 2.5 will not process a\nlikenesses of real people\". Never read `COMPLETED` as success; read the result. Regenerating the\nstill with softer features does not help — it is a filter on the endpoint, not a prompt problem.\nFor a photoreal creator go to `minimax/h3-max-turbo/image-to-video`, which accepts the same\n5. **Seedance 2.5 reference-to-video** (when the engine fits) with references mapped by name: `@Image1` creator, `@Image2` room, `@Image3` product, `@Video1` reference motion. The prompt carries timestamped actions, product and creator consistency, camera behaviour, audio, and natural UGC details.\n6. **Check** face, hands, product, dialogue and continuity. Fix one wrong part with a focused correction prompt rather than rebuilding.\n## Two prompts that carry the whole style\nHook remake (Simone Canciello):\n```\n- iPhone quality, handheld movement\n- FaceTime with a friend vibes\n- NO TEXT ON SCREEN\nReference edit (ViralOps): \"Edit @video1. Replace the character with the person from @image1. Place her inside the room"
  }
} as const;
export const ccFormatRoutes = {
  "talking-head": {
    "imageSkills": [
      "gpt-image-people",
      "ugc-realistic"
    ],
    "videoSkills": [
      "ugc-realistic",
      "ugc-ad-formats"
    ]
  },
  "narration-led": {
    "imageSkills": [
      "gpt-image-people"
    ],
    "videoSkills": [
      "ugc-ad-formats",
      "seedance-home-video"
    ]
  },
  "presenter-led": {
    "imageSkills": [
      "gpt-image-people",
      "ugc-realistic"
    ],
    "videoSkills": [
      "ugc-ad-formats",
      "h3-video"
    ]
  },
  "ranking": {
    "imageSkills": [
      "gpt-image-people"
    ],
    "videoSkills": [
      "ugc-ad-formats"
    ]
  },
  "short-drama": {
    "imageSkills": [
      "gpt-image-people"
    ],
    "videoSkills": [
      "ad-story-framework",
      "h3-video"
    ]
  },
  "street-interview": {
    "imageSkills": [
      "gpt-image-people",
      "ugc-realistic"
    ],
    "videoSkills": [
      "ad-story-framework",
      "ugc-ad-formats"
    ]
  },
  "podcast": {
    "imageSkills": [
      "gpt-image-people",
      "ugc-realistic"
    ],
    "videoSkills": [
      "ugc-ad-formats"
    ]
  }
} as const;
