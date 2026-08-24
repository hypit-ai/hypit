# Reference-video reconstruction route

This route reconstructs a complete reference video as usable `main.svml`, `recipes.svs`, and
`build.svrun`. The main agent owns all decisions and source code. Observation is a separate job with a
separate output: natural-language evidence about what the reference shows, written before and apart
from any decision about what to build. `observers.md` says who does that job — Gemini, or you reading
pictures — and the boundary holds either way.

## What this route delivers, and what it does not

The deliverable is **the components the video needs, the three source files, and the Runtime Profile
that binds what they demand**, and it must be **wired**: the preview check proves every track the
sources declare traces to the Film, so the author's first Build is not spent discovering that it
never could have. Every generation the Source declares is declared, not performed: no Build is
submitted for the pictures, and no video generation, speech synthesis, alignment or final render is
run. Those belong to a later step that the author starts deliberately, after reading what was
written.

Seeing the reconstruction is what the author's first Build is for: Studio opens a Run whose material
is satisfied, and until that Build runs this one's is not. What is *not* deferred is that the graph
traces, which is the part a Build cannot repair.

One exception, because it is not a generation of the video: a component's own surface — the field its
elements are drawn on, whatever that is — is produced while the package is authored, with
`hypit image`, and committed inside the package. `../playbooks/craft/generated-dependencies.md` draws
that line.

**That exception covers the component's surface and nothing else.** Every other picture the video
shows — the inner picture of a card, an inserted screenshot, a thumbnail, a product shot, a logo
wall, a phone or monitor's content — is the video's content, and content is **declared in
`main.svml` as a generation**, never produced with `hypit image` into an assets directory and
referenced as a file:

```svml
<copy:Value id="meme-look">A screenshot of a vertical social-media post…</copy:Value>
<gpt:Image id="meme-shot" prompt={meme-look} aspect-ratio="4:5" resolution="2K"/>
```

Writing `<media:Image src="./assets/meme.png"/>` instead spends money this route is not supposed to
spend, and loses the thing that mattered: the prompt. A declared generation carries its own
description in the Source, so it can be reread, corrected and rebuilt; a PNG on disk carries nothing,
and the next person has to invent the prompt again. `media:Image` is for material the author
supplied, not for material you generated a moment ago.

Reference observation is part of the work and is expected to cost what it costs.

## A requested change is made after the reconstruction is complete

The author often wants the result to differ from the reference: their presenter rather than the one
in the video, their product rather than the promoted one, their brand. Reconstruct the reference as
it is anyway, all of it, and then read what you wrote and change it to what they asked for.

The reason is that the reconstruction is checkable only while it claims to reproduce the video that
was observed. The observations describe the reference and are cached, and `compare_reconstruction`
judges a rendered element against the reference. Author the change into the sources early and the
evidence describes one video while the sources describe another, which leaves the reconstruction with
nothing to be checked against while it is still being written.

Afterwards the sources are yours to change. You wrote every one of them, and the identity of each
recurring person and product is already a single anchor in them, because
`../playbooks/craft/persona-and-audio.md` and `../playbooks/craft/visual-continuity.md` required that
while you were writing.

## A video path is the whole request

The author gives one thing: the path to a video. Not a working directory, not a project name, not
which packages to use, not where to put the result — those are yours to decide, and asking for them
is asking the author to do your job. Everything this route needs beyond the video path is
discoverable:

- **Where you are, and what is installed.** `../environment.md`.
- **Where the project goes.** Its own directory outside the installed Distribution, normally
  `<home>/<something>-reverse/`, named after the video. `../runtime.md` defines the hard boundary.
  Use a directory the author named only if they named one.
- **Credentials.** A project may keep them in an uncommitted `.env`; load it as shown below. A variable a Provider
  needs and this machine does not hold is named, and the route stops there — with one exception, the
  Vertex pair, which selects an observer rather than blocking one. `observers.md` owns that.

Ask the author about the video and nothing else: what it is for, who is in it, what it should say.
Those answers describe the result they want rather than the reconstruction; record them and apply
them once the reconstruction is complete. Never interrupt to ask which generator, which package,
which directory, or whether to proceed.

## Before the first command

Ask the author which observer reads the reference, and ask it before anything runs. `gemini` uploads
the video to Vertex and hears it; `agent` hands each observation to you as a picture to read and needs
no credentials. Read `observers.md` first: it says what each one costs in the terms the author needs
to choose between them, how to report what this machine holds rather than asking them to recall it,
and what the `agent` observer can and cannot answer. The answer is passed once, as `--observer`, and
the reference keeps it.

When the Vertex credentials are absent, `agent` is what can run — say that, say that it reads the
reference a little less closely, and take the author's answer. Then say which observer is reading,
before the evidence starts. Both are in `observers.md`, which also says to give each observation to
its own subagent where the harness has them: that is what makes the sweep parallel rather than serial,
and what keeps the observations independent of one another.

This is the only question this route asks about how it runs, and it is asked once, before the evidence
starts.

A project that keeps its credentials in a `.env` file does not load it automatically. Load it into the
environment first — the `gemini` observer needs the Vertex pair, and either observer may still need
credentials for the generation the author starts later:

```bash
set -a && source .env && set +a
```

`../credentials.md` lists which variables each Provider needs.

## Start the evidence before you read

`prepare_reference` and the full `observe_reference` sweep take several minutes and need none of the
knowledge below: their prompts are fixed, and nothing you are about to read changes what they ask.
Start them first and read while they run. Reading first and observing afterwards makes the same run
several minutes longer for nothing. This is not the whole command order — `workflow.md` names the
sequence — it is specifically that the observation sweep must not wait on the reading. `list_svml_packages`
is an instant directory read that runs independently at the step the sequence names; it neither
delays the sweep nor is delayed by it.

```bash
hypit-reference-video-tools prepare_reference --video-path <path> --observer <chosen>   # about a minute
hypit-reference-video-tools observe_reference --reference-id <id>                       # run in the background
```

On the `agent` observer both commands return immediately with the observations they owe, and reading
the files below is what you do between answering them. Answer `prepare_reference`'s four first:
`observe_reference` quotes them into every shot's question and refuses to run until they exist.

Then read the files below while the sweep is working, and collect its result when you are done.

Before acting on the evidence, read these files completely in order:

1. `observers.md` — which observer is reading, what it is handed, and what it cannot answer. It is
   first because the answer to its question was needed before any of this ran, and because every file
   below describes evidence it shapes.
2. `workflow.md` — CLI sequence, evidence flow and responsibility boundaries.
3. `continuity.md` — mandatory shot, overlay, B-roll, speaker, product and persistent-system rules.
4. **Every craft file listed in the first item of `../playbooks/index.md`'s required load order — the
   ones it marks always-read.** That list decides *which* files, and it grows: one added there is
   required here from the moment it is added, whether or not it appears among the notes below.
   Restating the set in this file is what once left a required craft file reachable from one route
   and invisible to the other.

   Its paths are written from `../playbooks/`, so a file it names as `craft/<name>.md` is
   `../playbooks/craft/<name>.md` from here. Only that list's first item is meant: the same section goes on
   to name Seedance directing, a format file and package READMEs conditionally, and none of those
   conditions can even be evaluated before the evidence is in.

   Read them in the order below, which is this route's rather than that list's — a reconstruction
   needs to know what a picture *is* before what one generation owes another, and needs both long
   before a Build is staged:
   - `../playbooks/craft/graphic-compositions.md` — what may be a base picture, when a full screen is
     one authored composition, and where a missing picture comes from.
   - `../playbooks/craft/generated-dependencies.md` — what one generation owes another: the location,
     the split picture, the voice, the first frame, and the stretch too short to be a take.
   - `../playbooks/craft/frame-coverage.md` — what is on screen at every instant, and the edges
     nobody chose.
   - `../playbooks/craft/visual-continuity.md` — recurring anchors as explicit artifacts, one
     location generated once, and the reverse-view geometry that must hold across takes.
   - `../playbooks/craft/production-gates.md` — images and takes generate and are reviewed in rounds,
     and accepted Records are pinned for reuse.

   A file that list names and this one does not is read last, before `vocabulary.md`.
5. `../vocabulary.md` — how a package is chosen for any route: enumerate every system before naming
   one, what `list_svml_packages` and `inspect_svml_vocabulary` report, reuse before compose before
   declaring a gap, and what a real gap obliges.
6. `vocabulary.md` — what the reference evidence adds to that: enumerating from the observations, and
   measuring an appearance value rather than choosing it.
7. `../preview.md` — proving the Run traces before a Provider is reached, and rendering one element
   without paying for it. Both are used later, by `final-sources.md` and
   `reconstruction-loop.md`; read them here so neither arrives as a surprise.

Two more are required, at the point where they apply rather than now. Reading them here means
reading them half an hour before they matter, with a dozen other files in between:

- `final-sources.md` when the components exist and the sources are about to be written.
- `reconstruction-loop.md` **as soon as the sources place an element** — that is the first moment the
  loop has something to render, since what it compares is the element configured the way this video
  configures it. No Build is submitted on this route, so a trigger worded around one never fires; a
  trigger worded around a package's catalogue preview fires too early, before any Source exists to
  read values from.

This route ends on a command rather than on a judgement that the work looks done. Every element the
Source places that draws a Track must have been compared against the reference at least once, and
that is checkable:

```text
hypit-reference-video-tools reconstruction_check projects/<name>/build.svrun
```

It names each element that has never been compared and the command that compares it, and reports
`"passed": false` until none are left. It asks for participation rather than convergence —
`reconstruction-loop.md` is deliberately bounded and may stop with visible differences remaining — so
an element compared once and stopped at its ceiling passes, and an element nobody looked at does not.

The same command settles one thing about the picture that a Build would otherwise be the first to
show: it reads each timed picture's appearance Recipe and refuses a `playback` left at its default,
which draws generated material once and then draws nothing for the rest of the window.
`../playbooks/craft/generated-dependencies.md` says what to set and why the material's length cannot
be relied on.

It uses a prepared reference, and how it picks which one is worth knowing before it is run:

- exactly one reference is prepared → it uses that one;
- several are prepared → it demands `--reference-id <id>`, and refuses without it;
- none → it refuses, telling you to run `prepare_reference` first.

A comparison run without `--element` is not credited to any element, and a misspelled `--element`
credits nothing either — it reports logged element names that do not exist in the Source. Which
package draws an element makes no difference to the requirement: a Track from installed vocabulary
carries authored values exactly as a project-local one does — a caption Style's size, colour and
placement — and `render_element` stands in for the speech, so it renders before a Build like any
other. A project that places no drawing element passes with nothing to require.

Paths above are relative to this file's directory. Do not skip a file because the task looks like a
familiar video format.
