# Seedance directing

## Build the prompt inputs

1. Vendor one matching Kit into the project's `./kits/` directory. `../../seedance-kits.md` lists the
   seven shipped Kits, the dynamic slots each one requires and the ordered references it expects.
2. Import generic Text as `copy` and the vendored Kit under its own alias.
3. Put stable creative choices in a named SVS Recipe.
4. Render the Kit with `copy:Render`; connect only dynamic `dialogue`, `action`, `story`, or
   `direction` slots through `copy:Set`.
5. Feed the rendered Text to one explicit Seedance Surface and keep every reference edge visible.

Write every user-authored image/video generation instruction in English. Verbatim dialogue may retain
the Script's authored language; do not translate or paraphrase quoted Script lines inside prompts.

Choose the Kit by meaning:

| Use | Kit | Expected ordered references |
|---|---|---|
| one speaking person | `speaker-v1` | image 1 = person/scene; audio 1 = voice when used |
| silent B-roll | `broll-v1` | one or more authored images |
| two-person podcast | `podcast-v1` | images 1/2 = final A/B views; audio 1/2 = A/B voices |
| video call | `call-v1` | images 1/2 = reversed call layouts; audio 1/2 = A/B voices |
| street interview | `street-interview-v1` | image 1 = complete scene; audio 1/2 = interviewer/guest |
| body-motion transfer | `motion-reference-v1` | image 1 = subject; video 1 = motion reference |
| camera-language transfer | `camera-reference-v1` | image 1 = subject; video 1 = camera reference |

Use `seedance:TextVideo` for prompt-only generation, `seedance:FrameVideo` for first/optional-last
frame control, and `seedance:ReferenceVideo` for image/video/audio references. Do not duplicate the
Kit's fixed reference, role, voice, microphone, camera, or text-hygiene blocks in freeform prose.
Set `generate-audio="false"` for silent B-roll and set it deliberately for speaking formats rather
than relying on an unstated assumption.

## Respect model contracts

- **`mini` is the model, unless the author named another one.** Write `model="mini"` on every take
  and do not reach for `fast`, `standard` or `2.5` on your own judgement: a video is many takes, most
  of them are regenerated more than once, so the tier multiplies the whole bill for a difference that
  costs more to find than it is worth. Take an instruction to use a particular model literally when
  one is given, and otherwise never raise the tier and never stop to ask which to use.
- The other values are `fast`, `standard` and `2.5`. `mini` and `fast` support only 480p/720p;
  `standard` also supports 1080p/4k, which is the one reason to name it — a delivery that genuinely
  requires 1080p, recorded as the deliberate choice it is.
- Keep duration an integer inside the selected model's declared range, and read that range from the
  model rather than from memory: they differ, and one accepts far longer takes than the others.
  Invalid values fail closed.
- Never generate from a prompt alone, and never author a take shorter than the floor.
  `generated-dependencies.md` says what to do with a stretch too short to be a take.
- Respect the ReferenceVideo caps: at most 9 images, 3 videos, 3 audio clips, and 12 total files.
  Reference audio requires at least one visual reference.
- Use `estimate:Speech` for speech-driven duration planning; it estimates pronunciation length but
  does not create measured timing.

## Direct the shot

- Write one or two readable events: a macro action plus small eye, brow, breath, smile, concern, or
  posture feedback. Do not choreograph frame-by-frame poses.
- Start from the reference pose, objects, emotion, camera, and room. Add only motion that follows from
  visible facts already established by the image.
- Give objects a physical motion envelope: known starting support/contact, short believable travel,
  and stable count/shape. Avoid teleporting, flying, multiplying, or detaching props.
- Tie speech actions to Script order. Quote only exact Script words; otherwise refer to semantic beats
  such as opening, reversal, evidence, and verdict.
- Keep faces readable and hands away from the face unless contact is the authored action.
- Keep editorial subtitles, titles, cards, stickers, and floating text out of Seedance. Preserve only
  physical labels/UI already attached to referenced objects.

Review every reference image through `production-gates.md` before calling Seedance, then review the
resulting take before adding it to Speech Spine or Media Track.
