# Author Surface Binding

Status: implemented compiler contract for trusted package-owned Surfaces; third-party isolation is
not yet implemented.

## 1. Purpose

The generic Markup Frontend owns element syntax. A package-owned Surface owns what one imported tag
means. SVS owns only its stylesheet syntax and produces generic immutable Recipe records. Neither
Markup, SVS nor Core owns Caption, B-roll, Film or another package's property vocabulary.

The missing bridge is compile-time reference inspection: a Surface such as Caption must be able to
read an explicitly referenced public Recipe and lower it into a nominal `CaptionProgram` before the
Core graph is built.

This document defines that bridge without adding a global Recipe registry or a Runtime step.

## 2. Ordered compilation boundary

One Source Closure compiles in this order:

```text
recursive imported SourceUnits
  -> admitted public Records and symbolic component exports
  -> current document generic syntax
  -> package-owned Surface compilation
  -> typed authored Records + AuthorComponents + locked GraphFragments
  -> parser-independent Author linking
  -> Core CompiledGraph
```

An imported `.svs` SourceUnit therefore finishes before a consuming `.svml` SourceUnit. The
consuming Surface receives the structured element and a resolver for references explicitly written
in that element.

## 3. Reference result

A resolved Surface reference contains:

```text
path       source spelling used by the element
ref        hygienic AuthorValueRef
type       exact nominal TypeRef
record?    defensively copied TypedRecord when the public export is already an authored Record
```

A component output has no compile-time Record and therefore omits `record`. A Surface that needs to
inspect a value, such as a Recipe decoder, must require an authored Record and fail during `check`
when the reference is unresolved, has the wrong Type, or has no value yet.

Only public record exports of an imported SourceUnit are exposed. Private child records are not
part of the resolver. Every returned Record is a defensive canonical copy so Surface code cannot
rewrite an already compiled child SourceUnit or a previous declaration.

## 4. Package ownership

For this source:

```svml
<caption:Track appearance={studio.caption.dialogue}/>
```

the responsibilities are:

```text
@svml/svs
  parses studio.svs
  produces generic @svml/svs#Recipe

@svml/markup
  parses the element and the whole-value reference
  resolves only the public imported binding

@svml/caption Surface
  requires @svml/svs#Recipe
  validates Caption-owned properties
  emits nominal @svml/caption#CaptionTrackProgram
  emits the AuthorComponent and locked GraphFragment

Author compiler
  resolves symbolic component dependencies and types

Core
  sees only typed Records, LogicalOutputs, Candidates and Operations
```

There is no universal property table. Another package may interpret the same generic Recipe through
another explicitly imported Surface and produce a different nominal Program. The Surface is never
selected by the Recipe shape; the author selected it by writing the namespaced component.

## 5. Surface output law

A Surface may emit only:

1. authored Records whose exact Type appears in its locked Manifest `outputs` allowlist;
2. AuthorComponents whose Fragment digest is contributed by that decode result;
3. immutable GraphFragments;
4. non-semantic source-map facts.

The Frontend seals authored Record provenance with source and Frontend Closure identity, verifies
its structural Type, and passes it through the Host admission gate before linking. A Surface cannot
inject a Record of another undeclared Type.

A typed Program derived from a Recipe should contain any source digest required by its package's
semantic validation. Its authored provenance already binds the Surface implementation digest and
the recursively compiled Source Closure. Alias spelling and filesystem location may change source
identity without changing the typed Program value or resulting Graph meaning.

## 6. Forward-reference law

Two cases are intentionally different:

- Graph dependencies may remain symbolic `component.output` references and are resolved after the
  complete document is collected, so ordinary component forward references remain valid.
- Compile-time value inspection requires an already compiled authored Record. Imported sources are
  always available; same-document value definitions must appear before a Surface that inspects
  them.

This is not a parser mode or Runtime mode. It follows from whether compilation needs the value now
or only needs a typed graph edge later.

## 7. What this is not

Surface Binding is not:

- a Core Type registry;
- an implicit conversion search;
- a Runtime Producer or paid Operation;
- a Provider capability;
- a global SVS decoder;
- permission to read credentials, files, network or stores.

The current Host executes only explicitly registered trusted Surface implementations. Locked code
bytes, permission enforcement and isolation are required before arbitrary community Surface code
can execute.

## 8. Executable proof

The non-video `example.recipe-card` fixture proves the boundary:

1. SVS emits a generic Recipe;
2. the Card Surface reads only its explicit public reference;
3. Card validates `fill` and `padding` during author compilation;
4. Card emits a nominal `CardAppearance` Record;
5. the runtime Producer consumes `CardAppearance`, not `SVS Recipe`;
6. an invalid color fails before a BuildPlan or external operation exists;
7. changing only the source-import alias preserves the Program Record and Graph identities.

Video packages must use this same mechanism rather than adding a video-specific compiler path.
