# SVML Visual IR

Status: implemented repository-internal `@1` compatibility waist; not yet published as an npm ABI.

## Position

`svml.visual-ir@1` is the one code-free terminal visual language shared by the official
SVML video stack. It is:

- a public video-domain protocol;
- not an author component;
- not a Provider API;
- not part of the domain-neutral Core.

Text, Caption, Media, Ranking and third-party visual packages may own unrelated author Programs.
Before entering a `Composition`, each package must lower its resolved result into a `VisualTrack`
that explicitly names this IR. A renderer adapter validates and compiles that common language; it
never learns the originating component family. `@narratage/hyperframes` is the first reference
adapter, not the owner of the protocol.

```text
author Program                 shared terminal protocol             final-render route
─────────────────────         ─────────────────────────            ─────────────────────
Text / Caption / Media   ───>  SVML Visual IR in Track      ───┬─> HyperFrames
custom visual producer   ───>  typed CompositableSurface    ───┤
                                                              ├─> future Remotion
                                                              └─> future render API
```

Calling this a component "dialect" is misleading. There is one official target protocol for the
current video stack. A component cannot import another set of CSS semantics and still claim to
produce the same IR.

## Contract

Every `svml.visual-track@1` carries:

```text
visualIr = svml.visual-ir@1
```

The value is covered by the Record that carries the Track and then transitively by the Records for
Composition and the selected renderer document. A Runtime cannot reinterpret an already compiled
Track under a different visual language.

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

The implementation exports `VISUAL_STYLE_NAMES_V1`. A declaration outside that list is
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

Validation has four separate owners:

1. `@narratage/visual-ir` owns the closed vocabulary and identity;
2. `@narratage/composition` owns Track schemas and intrinsic self-containment validation;
3. Film and final-render Producers receive ProgramSpace on explicit graph edges and validate
   relational frame-domain facts without adding lineage fields to Track values;
4. the selected local or hosted render Endpoint locks the actual renderer implementation and
   validates the produced media fact.

Core contains no video-specific branch. Its generic admission path invokes the installed
Type-owner validator for intrinsic tree, style and Artifact facts. Relations involving another
value remain ordinary multi-input Producer checks.

## Extension law

Installing a new visual component must not modify this protocol. The component either:

1. lowers its Program into existing elements and styles; or
2. materializes the visual it owns as a typed `CompositableSurface` and contributes that Surface.

Only a capability that is both broadly reusable and impossible to represent through those two
paths may justify changing the `svml.visual-ir@1` contract. While Narratage is pre-release the
identifier remains `@1`, with exact implementation identity carried by digests and package locks.
Adding a Text style, Caption mode, Media recipe, transition or Provider never qualifies by itself.

Old-system Text three-box, Caption range/cue/content and Media content-frame sampling models are
therefore package-owned Programs and lowering evidence. They are expressiveness witnesses for this
IR, not fields added to the IR.

## Freeze evidence

The identifier and closed vocabulary are executable. Exact Text fonts, multiline decoration,
Path/Mask/overflow, Media focal sampling and alpha now have real browser evidence; a separately
installed non-native Text package crosses the typed Surface waist without changing Core, Film or
HyperFrames. The repository-internal `@1` waist is frozen because all four independent gates now
execute:

1. the generic Need Receipt binds the locked Endpoint implementation/configuration/Runtime closure,
   while HyperFrames' receipt-covered attestation binds the exact browser bytes locally or the
   explicitly configured immutable renderer deployment digest remotely;
2. the shared media executor decodes Surface bytes and proves dimensions, frame timing, SDR/sRGB
   compatibility and opaque/straight-alpha facts before local rendering; a renderer Endpoint without
   that verifier must decline a Surface-bearing document;
3. Deck and Ranking provide the remaining package-owned Track expressiveness witnesses;
4. the repository-wide boundary audit proves that Composition contains no package-family/provider
   discriminator and the terminal compiler contains no hidden cross-Track sampling path.

This freezes the protocol for subsequent package work in this repository. It is not a statement
that npm packages have been published, that every author Surface is frozen, or that a future public
release may skip its distribution and security review.
