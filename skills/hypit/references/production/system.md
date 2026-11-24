# System Relationships

Hypit separates **authoring**, **generation**, **media ownership**, and **timeline editing** into
distinct, cooperating authorities inside one local **Project Boundary** (`hypit.project.json`).

## Architecture overview

```text
hypit project / nle / canvas ──▶ ApplicationHost ──▶ ProjectHost ──▶ owner Services
                                       │
                                       └─ project Execution clients ─┐
                                                                     ▼
hypit auth / execution ───────────────────────────────────────▶ ExecutionHost ──▶ Environment (HypiHub / BYOK)
```

1. **ApplicationHost (`hypit host start|status`)** opens Project Boundaries, serves Canvas and NLE
   owner Services, hosts NLE Studio and Canvas Studio browser sessions, and runs local audiovisual
   delivery.
2. **ExecutionHost (`hypit execution start|status`)** manages Execution Environments, account OAuth
   credentials (`hypit auth`), cost quotation, recoverable Invocations, and durable Publications.
3. **Canvas (`*.canvas.json`)** holds AIGC recipes, typed input bindings, Invocation attachments,
   and explicit Publication selections.
4. **Project Media (`*.media.json`)** holds accepted media files inside the Project Boundary (either
   imported locally or explicitly adopted from a Canvas Publication via `hypit canvas adopt`).
5. **NLE (`*.svml`)** holds the durable timeline edit: Compositions, Tracks, Presents, Adjusts,
   exact rational time mappings, layout, ordered Processes, Transitions, Mattes, and Edit Groups.
6. **TSX Composition Source (`@hypit/nle/authoring`)** is an optional author-time program that
   computes and materializes initial NLE facts into SVML. Reopening or exporting SVML never reruns
   the TSX program.

## Give each part the direction it can realize

- **Material generation (Canvas + ExecutionHost)**: direct image, video, speech, and matting models
  toward the intended casting, setting, framing, voice, and performance. Quote before paid runs,
  inspect completed Publications, and explicitly adopt the winning takes into Project Media.
- **Temporal & spatial assembly (NLE SVML)**: arrange adopted Media, authored Components (e.g.
  `@hypit/text-fine` or project-local packages), and nested Compositions on ordered Picture and
  Audio Tracks with exact rational time.
- **Delivery (`hypit nle export`)**: compiles the saved SVML snapshot into `HtmlProgram` +
  `AudioProgram` and renders locally using Electron + FFmpeg.
