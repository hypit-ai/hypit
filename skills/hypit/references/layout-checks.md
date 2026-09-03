# Layout checks are evidence, not design authority

Run this after `preview_check` whenever Source, SVS, runtime, fonts or a package can affect layout:

```bash
hypit-reference-video-tools layout_check --run <build.svrun> [--runtime <hypit.runtime.json>]
```

Pass the project's Runtime Profile when the Run contains `build-record` pins. The checker uses it
read-only to resolve those accepted Records; without it a pinned Run can fail before any layout is
measured.

The command does not render media, call a visual observer or invoke a paid Provider. It first realizes
the same preview-mock Run and Producer-generated Composition that the later visual render reuses, then
writes atomic state to
`.hypit/layout-check.json` and `.hypit/layout-decisions.json`.

It reports only `realized_layout`: DOM bounds after official or project-local Producers run, including
parent or Canvas overflow, vertical offset of package-internal content, and partial overlap between
independent top-level tracks. It does not treat literal SVML Canvas/Frame arithmetic as a quality verdict.

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
hypit-reference-video-tools layout_check --run <build.svrun> [--runtime <hypit.runtime.json>]
```

Several candidates from the same report can be accepted atomically with a JSON array (or an object
containing `findings`):

```bash
hypit-reference-video-tools layout_accept --run <build.svrun> --batch acceptances.json
```

Each entry is `{ "finding": "<id>", "reason": "<why this measured relationship is intentional>" }`.

The browser report separates candidates still needing judgement from intentional candidates carrying
a reason. It does **not** turn zero candidates into approval of the whole design. A browser, font or
Producer execution failure means no measurement was made and must be reported as such.

Finding identities are readable structural names built from the finding kind, package, Track,
Present, element and related element. They do not fingerprint the project. Rerun `layout_check` after
a visual repair, and read the affected declaration again when its appearance changed.

The 1 CSS px tolerance removes only browser numeric noise. It is not a design threshold and does not
turn measurements beyond it into mandatory fixes. Do not copy or edit an installed package after a
candidate appears; adjust legal SVS, choose another component, or use the formal project-local package
path.
