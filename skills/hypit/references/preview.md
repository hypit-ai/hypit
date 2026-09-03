# See what you authored without paying

Preview and inspection commands are independent. They do not write progress state or automatically
run one another.

## Trace the Run

```bash
hypit-reference-video-tools preview_check /path/to/project/build.svrun
```

`hypit check` proves Source legality; `preview_check` proves the Run can trace toward a Film. A report
whose only unresolved items are external Provider capabilities is a normal unbuilt project. Other
errors identify source or graph wiring to repair.

## Render one element locally

```bash
hypit-reference-video-tools render_element /path/to/project/build.svrun \
  --element <id> --segment <id>|--selection <id>|--tokens <from:to> \
  --out <path>.mp4
```

The command realizes the Run with local preview media, renders once, and cuts the requested window.
It never writes mock Candidates into Author Source and never reaches a paid Provider. A batch file can
request several windows from the same realization.

`--element` is the bare Source element id. The window is named in Script terms, never by copying a
reference timestamp. The returned sidecar records estimate timing.

Use `layout_check` when actual browser geometry matters. Its overflow, overlap and offset candidates
are advisory measurements. Fix confirmed problems or annotate intentional geometry with
`layout_accept`; do not treat the report as an approval condition.

## Open the complete preview

The preview realizer returns the exact `previewRun` path. Open that path rather than reconstructing a
directory name:

```bash
hypit-studio --run <previewRun> --runtime hypit.runtime.json
```

Use the standalone Studio launcher. Reuse an existing process for the same Run and startup parameters;
stop it before changing those parameters. Report the exact URL printed after Studio starts.

Studio is for a person to inspect. Automated comparison uses `render_element` plus
`compare_reconstruction` or `review_element`.

`<distribution-root>/docs/quickstart/preview.md` is authoritative for Studio behavior.
