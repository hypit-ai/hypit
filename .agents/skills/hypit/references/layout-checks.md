# Layout checks are evidence, not design authority

Run this after `preview_check` whenever Source, SVS, runtime, fonts or a package can affect layout:

```bash
hypit-reference-video-tools layout_check --run <build.svrun>
```

The command does not render media, call a visual observer or invoke a paid Provider. It first realizes
the same preview-mock Run and Producer-generated Composition that the later visual render reuses, then
writes atomic state to
`.hypit/layout-check.json` and `.hypit/layout-decisions.json`.

It reports only `realized_layout`: DOM bounds after official or project-local Producers run, including
parent or Canvas overflow, vertical offset of package-internal content, and partial overlap between
independent top-level tracks. It does not use literal SVML Canvas/Frame arithmetic as a quality gate.

`Present` is the Composition IR's time-bounded visual unit: one Producer output with its internal
text, icons, boxes and other elements. For each Present/content state, the checker derives its longest interval in which layout-affecting IR
does not change and measures the interval's middle frame. Findings for that sample are restricted to
that Present. Peer overlap is reported only when both Presents share a sampled stable frame. A Present
with no stable interval of at least two consecutive frames is skipped and left to the full-clip visual
review; moving entry and exit frames are not treated as layout evidence.

Every reported item is a **candidate measurement**, never a declaration that the design is wrong.
Cropping, bleed, overlap, off-screen entry motion and optical offset can all be intentional. Read the
measured relation, the relevant brief/reference and the rendered visual evidence, then either repair a
real problem or accept the intentional geometry:

```bash
hypit-reference-video-tools layout_accept --run <build.svrun> \
  --finding <id> --reason '<why this measured relationship is correct here>'
hypit-reference-video-tools layout_check --run <build.svrun>
```

Several candidates from the same report can be accepted atomically with a JSON array (or an object
containing `findings`):

```bash
hypit-reference-video-tools layout_accept --run <build.svrun> --batch acceptances.json
```

Each entry is `{ "finding": "<id>", "reason": "<why this measured relationship is intentional>" }`.

`layout-checked` means the browser/Producer pass executed and every candidate has been judged: repaired
candidates disappeared and intentional candidates carry a persisted reason. It does **not** mean the
mechanical checker reported zero candidates. A browser, font or Producer execution failure is a hard
failure because no measurement was made; it must never be converted into an empty passing report.

Finding identities include the relevant layout digest. A Source, SVS, package, runtime, font or
composition change invalidates affected acceptances. Rerun `layout_check` after any visual repair, and
rerun the affected declaration's visual review when the repair changed its look. The final gate needs
both settled layout evidence and current visual evidence where that route performs visual review.

The 1 CSS px tolerance removes only browser numeric noise. It is not a design threshold and does not
turn measurements beyond it into mandatory fixes. Do not copy or edit an installed package after a
candidate appears; adjust legal SVS, choose another component, or use the formal project-local package
path.
