# SVML

SVML is the XML-like persistent spelling of one `NleProject`. The TypeScript `NleProject` value is the semantic
schema; the SVML Reader, serializer, Project validator and delivery compiler must agree on every persisted fact.

SVML is data, not an evaluator. It contains no imports, variables, functions, conditions, loops, package code,
renderer program, execution request or editor state. A TypeScript/TSX author program may materialize ordinary NLE
facts, but reopening, editing and lowering the accepted SVML never reruns that program.

## Closed project structure, open package values

NLE owns the finite structure that every direct edit needs: Compositions, Tracks, Items, exact time, Picture layout,
Processes, Adjusts, Transitions, Mattes and explicit references. Installed packages own Component and Operator
behavior. SVML stores package-owned behavior as an unversioned npm package symbol plus a closed JSON object.

“Closed JSON” means JSON-compatible data with an object at its root. Nested objects, arrays, strings, finite numbers,
booleans and `null` are allowed. Functions, `undefined`, non-finite numbers, cyclic objects and runtime handles are not.
The package validates the fields and meaning of its values; NLE preserves the value without interpreting its paths.

This is the extension seam. A new Component, filter, transform, animation, caption style or audio treatment can define
a new closed value without adding an SVML element. Package versions remain selected by `package.json` and the project
lockfile, so package names and symbols in SVML are unversioned.

## XML subset

The current Reader accepts:

- one optional XML declaration;
- elements and quoted attributes;
- text with XML entities;
- comments;
- the elements and attributes listed below.

It does not accept DTDs, processing instructions after the XML declaration, namespaces, CDATA or mixed domain markup.
Unknown elements and attributes fail structurally. Comments and formatting are not NLE facts; serialization produces
canonical indentation and does not preserve them.

All ids use the current NLE identity grammar and are unique in the scope enforced by the Project validator. References
name current Project objects directly. There are no query, expression or fallback references.

## Root and definitions

```xml
<svml id="edit" name="Main edit" root="main">
  <!-- shared-value and composition definitions -->
</svml>
```

| Element | Required attributes | Optional attributes | Children |
| --- | --- | --- | --- |
| `svml` | `id`, `name`, `root` | none | `shared-value`, `composition` |
| `composition` | `id`, `name`, `width`, `height` | none | `track`, `transition`, `matte` |
| `track` | `id`, `name`, `kind`, `enabled` | none | `present`, `adjust` |

`root` references one Project-owned Composition. `width` and `height` define its positive, unit-neutral Picture
canvas. `track.kind` is `picture` or `audio`; `enabled` is `true` or `false`. Picture Track order is back-to-front.
Picture Item order is the direct back-to-front paint order within its Track, including overlapping Items. Audio
contributions mix.

A `track` can declare `role="effect"` for Picture or Audio, or `role="text"` or `role="subtitle"` for Picture.
Subtitle Tracks contain Component Presents carrying `role="subtitle"`. Other Presents follow their track's
ordinary Picture or Audio placement rules. The authored Track order determines Picture paint order.

## Present Items

Every Present has one source kind, exact Programme placement and one source-time mapping:

```xml
<present id="take" name="Take" source="media"
         start="0/1" duration="10/1" enabled="true">
  <media path="../media/take.media.json" />
  <source-time>
    <linear target-start="0/1" target-end="10/1"
            source-start="0/1" rate="1/1" />
  </source-time>
  <picture>
    <layout x="0" y="0" width="1920" height="1080" fit="cover" />
  </picture>
  <audio />
</present>
```

| Element | Required attributes | Optional attributes | Children |
| --- | --- | --- | --- |
| `present` | `id`, `source`, `start`, `duration`, `enabled` | `name` | one source child, one `source-time`, optional `picture`, optional `audio` |
| `media` | `path` | none | none |
| `component` | `package`, `symbol` | none | none |
| `composition` inside a Present | `ref` | none | none |

The `source` attribute selects exactly one shape:

- `media`: one `media` child;
- `component`: one `component`, one `parameters`, zero or more `value`, and zero or more `media-input` children;
- `composition`: one `composition ref` child.

Media paths are portable paths relative to the SVML document. Opening SVML does not inspect the target Media Asset.
A Composition occurrence references a sibling definition by id; definitions are reusable and cycles are invalid.

### Component values

```xml
<present id="board" source="component" start="2/1" duration="6/1" enabled="true">
  <component package="@project/ranking" symbol="board" />
  <parameters>{"entries":[{"id":"first","label":"First"}]}</parameters>
  <value slot="style" ref="ranking-style" />
  <value slot="badge">{"shape":"round"}</value>
  <media-input name="entry:first" path="../media/first.media.json" />
  <source-time>
    <linear target-start="0/1" target-end="6/1" source-start="0/1" rate="1/1" />
  </source-time>
  <picture>
    <layout x="120" y="80" width="1680" height="920" fit="contain" />
  </picture>
</present>
```

`parameters` is the occurrence-local package value. Each package-declared `value` slot contains either inline closed
JSON or one `ref` to a compatible Project Shared Value. Inline and shared values have the same package meaning and
lower to the same resolved slot map; ownership is not exposed to Component execution. They remain separate from
`parameters`. `media-input` maps one package-owned input name to one Media Asset. Input names and value slot names
cannot repeat within an occurrence.

| Element | Required attributes | Optional attributes | Content |
| --- | --- | --- | --- |
| `value` | `slot` | none | inline closed JSON object |
| `value` | `slot`, `ref` | none | empty; `ref` selects a compatible Project Shared Value |
| `media-input` | `name`, `path` | none | empty |

## Exact time mappings

Times use exact seconds rationals `numerator/denominator`; the denominator is positive. A mapping contains one or more
contiguous pieces covering its target domain as required by the Project validator.

```xml
<source-time>
  <linear target-start="0/1" target-end="2/1"
          source-start="4/1" rate="1/1" />
  <linear target-start="2/1" target-end="4/1"
          source-start="6/1" rate="-1/1" />
</source-time>
```

| Piece | Required attributes | Optional attributes |
| --- | --- | --- |
| `linear` | `target-start`, `target-end`, `source-start`, `rate` | both `wrap-start` and `wrap-end` |
| `cubic` | `target-start`, `target-end`, `source-start`, `source-control-1`, `source-control-2`, `source-end` | none |

A zero linear rate is a hold. A negative rate is reverse. Wrap bounds must be supplied together. `source-time` maps
Item-local visible time to Media, Component or child-Composition time. `control-time` maps Item-local visible time to
one package Operator's stable Control domain.

## Picture and Audio appearances

```xml
<picture>
  <layout x="0" y="0" width="1920" height="1080"
          fit="cover" content-x="0.5" content-y="0.5" />
  <reconstruction package="@project/picture" symbol="nearest">
    <parameters>{}</parameters>
  </reconstruction>
  <!-- ordered process elements -->
</picture>
```

`layout` is either an inline NLE-owned frame or one exact linked value:

```xml
<layout ref="hero-layout" />
```

Inline `fit` is `fill`, `contain` or `cover`. `content-x` and `content-y` are optional normalized focal coordinates.
Media and Composition Presents may have Audio appearances. Component Presents supply Picture appearances.
Each appearance may contain ordered `process` elements. A Media Picture may select a package
`reconstruction` for its mapped read. The selected implementation samples a timed Picture.

## Processes and Adjusts

A Process is ordered, occurrence-local use of one package Operator:

```xml
<process id="motion" package="@project/picture-effects" symbol="transform" enabled="true">
  <parameters>{"kind":"constant","state":{"rotationDegrees":0}}</parameters>
  <control-time>
    <linear target-start="0/1" target-end="10/1"
            source-start="0/1" rate="1/1" />
  </control-time>
</process>
```

Its parameters are either the one inline `parameters` child or one `parameters-ref` attribute naming an Operator
Shared Value. The two forms are mutually exclusive.

An occurrence-local Process can align the start or end of its Control interval to the corresponding Present edge:

```xml
<control-time edge="end" duration="1/6" control-duration="1/4" />
```

`duration` measures the interval on the Present, and `control-duration` measures the complete Operator Control
domain. The example plays a quarter-second curve in the last sixth of a second of the Present. The curve holds at
its boundaries outside that interval. A short Present crops the curve at the free end. An explicit Process map may
also specify `control-duration` to retain the complete domain when a split preserves only part of the curve.

An Adjust applies one package Operator to the signal accumulated below its Track position:

```xml
<adjust id="look" name="Programme look"
        package="@project/picture-effects" symbol="grade"
        start="0/1" duration="10/1" enabled="true">
  <parameters>{"contrast":1.1}</parameters>
  <control-time>
    <linear target-start="0/1" target-end="10/1"
            source-start="0/1" rate="1/1" />
  </control-time>
</adjust>
```

The containing Track selects Picture or Audio. Static values, keyframes and interpolation are package-owned JSON;
SVML does not add one element per effect or animated property.

## Transitions and Mattes

```xml
<transition id="cut" outgoing="a" incoming="b"
            package="@project/transitions" symbol="dissolve">
  <parameters>{"softness":0.5}</parameters>
</transition>

<matte id="mask" content="title" matte="shape"
       package="@project/mattes" symbol="alpha">
  <parameters>{}</parameters>
</matte>
```

Both are Composition-local relations between Present ids. Transition time is the validated canonical overlap of its
endpoints. Matte time is the content range. Package Controls use the implicit local relation domain.

## Shared Values

Shared Values live at Project scope and have one exact declaration owner.

### Component slot

```xml
<shared-value id="caption-style" name="Caption style" owner="component">
  <component package="@project/captions" symbol="fine" slot="style" />
  <value>{"font":"Inter","size":64}</value>
</shared-value>
```

### Operator parameters

```xml
<shared-value id="motion" name="Shared motion" owner="operator">
  <operator package="@project/picture-effects" symbol="transform" />
  <value>{"kind":"constant","state":{"rotationDegrees":0}}</value>
</shared-value>
```

### NLE Picture layout

```xml
<shared-value id="hero-layout" name="Hero frame" owner="nle">
  <picture-layout x="0" y="0" width="1920" height="1080" fit="cover" />
</shared-value>
```

Component values bind only to the exact Component and slot. An occurrence may hold that slot inline, link it to a
Shared Value, or unlink by copying the resolved shared value back inline. Operator values bind only to the exact
Operator. `picture.layout` binds only to Picture layout. Shared Values do not contain references to other Shared
Values.

## Validation and package responsibility

Reading proceeds without executing package code or inspecting Media:

1. the XML Reader validates the exact element and attribute structure;
2. the NLE Project validator validates ids, references, time, track rules, relations and Shared Value bindings;
3. a selected package contribution validates and edits its own closed Component or Operator values;
4. Delivery compilation resolves installed implementations and Media for one accepted Project snapshot.

A missing package or package-owned input is reported with the referring NLE object. Unknown SVML structure fails by
the current structural rules. The Reader does not infer another schema.

## Canonical serialization

`serializeNleProject(project)` validates the Project first, escapes XML text and attributes, prints exact rational
time, emits package values as JSON and uses stable indentation. For every valid current Project value:

```text
readNleProject(serializeNleProject(project)) == project
```

The equality is semantic Project equality. Original whitespace, attribute order and comments are not persisted facts.
A future source-preserving file adapter may retain them, but it must still submit the same `NleProject` commands and
cannot become a second author authority.
