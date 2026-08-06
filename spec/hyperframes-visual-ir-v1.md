# HyperFrames Visual IR v1

Status: executable candidate; closed vocabulary, not yet a frozen open-source ABI.

## Position

`svml.hyperframes-visual-ir@1` is the one code-free terminal visual language shared by the official
SVML video stack. It is:

- a public video-domain protocol;
- not an author component;
- not a Provider API;
- not part of the domain-neutral Core.

Text, Caption, B-roll, Ranking and third-party visual packages may own unrelated author Programs.
Before entering a `Composition`, each package must lower its resolved result into a `VisualTrack`
that explicitly names this IR. `@svml/hyperframes` validates and compiles that common language; it
never learns the originating component family.

```text
author Program                 shared terminal protocol              implementation
─────────────────────         ─────────────────────────             ───────────────────
Text / Caption / B-roll  ───>  HyperFrames Visual IR in Track  ───>  @svml/hyperframes
custom visual renderer   ───>  typed CompositableSurface       ───>  @svml/hyperframes
```

Calling this a component "dialect" is misleading. There is one official target protocol for the
current video stack. A component cannot import another set of CSS semantics and still claim to
produce the same IR.

## Contract

Every `svml.visual-track@1` carries:

```text
visualIr = svml.hyperframes-visual-ir@1
```

The value is covered by the Track digest and then transitively by the Composition and
`HyperframesDocument` digests. A Runtime cannot reinterpret an already compiled Track under a
different browser language.

The IR contains only:

- frame-exact Presents with absolute stacking keys;
- one Present-local tree of `box`, `text`, `image`, `video` or `surface` elements;
- content-addressed media, font and Surface references;
- a closed list of browser-oriented style declarations;
- frame-addressed local keyframes over opacity, transform, filter and clip;
- safe data/ARIA attributes.

It contains no component family, author recipe, provider name, selector, script, external URL,
runtime credential, sibling Track reference or accumulated-composite input.

## Closed rendering vocabulary

The implementation exports `HYPERFRAMES_VISUAL_STYLE_NAMES_V1`. A declaration outside that list is
invalid even when a particular Chromium build happens to understand it. Critical enum-shaped facts
such as `position`, `display`, `overflow`, `object-fit`, direction and writing mode additionally use
closed value sets.

The following fail closed:

- unknown CSS properties;
- `position: fixed` and scrolling layout;
- `backdrop-filter` or `mix-blend-mode` cross-Track sampling;
- CSS `url(...)` instead of typed Artifact references;
- `var(...)`, `env(...)` or `attr(...)` environment-dependent values;
- declaration-breaking punctuation;
- animation of properties outside the local animation set.

This is intentionally not "arbitrary CSS in JSON". The CSS-shaped representation is merely the
serialized instruction vocabulary of the locked browser target.

## Validation ownership

Validation has three separate owners:

1. `@svml/contracts` owns the IR schema, closed vocabulary, identity and self-containment validator;
2. Track producers, Film and `@svml/hyperframes` invoke that owner validator before a Track reaches
   document compilation;
3. a local or hosted HyperFrames Provider locks the actual renderer implementation and validates
   the produced media fact.

Core contains no video-specific branch. Its generic admission path checks the static Type schema;
the package-owned identity validator performs the deeper tree, style, Artifact and ProgramSpace
checks. Moving that validator behind the logical Type-owner registration boundary remains part of
the general validator-activation work, not a reason to teach Core about visual semantics.

## Extension law

Installing a new visual component must not modify this protocol. The component either:

1. lowers its Program into existing elements and styles; or
2. materializes the visual it owns as a typed `CompositableSurface` and contributes that Surface.

Only a capability that is both broadly reusable and impossible to represent through those two
paths may justify a future `svml.hyperframes-visual-ir@2`. Adding a Text style, Caption mode, B-roll
recipe, transition or Provider never qualifies by itself.

Old-system Text three-box, Caption range/cue/content and media content-frame sampling models are
therefore package-owned Programs and lowering evidence. They are expressiveness witnesses for this
IR, not fields added to the IR.

## Remaining freeze gates

The identifier and closed vocabulary are executable, but v1 remains a candidate until:

1. official Text and Caption lowerers require exact font Artifacts or materialized glyph Surfaces;
2. old production text/media witnesses have real browser pixel tests, including CJK, emoji,
   multiline decoration, focal sampling, alpha and overflow;
3. the Runtime receipt binds the exact browser/HyperFrames implementation used for layout;
4. Surface bytes are checked against their declared dimensions, timing, color and alpha facts;
5. a separately installed Track package passes without changing Core, Film or HyperFrames code.
