# `@svml/text`

Official XML-like Author Frontend for `.svml` source units. It owns only the `<svml>` envelope,
the leading Import Prologue, namespace binding, generic structured elements and dispatch to
statically declared module Surfaces.

The package has no built-in Script, media or video vocabulary. `<script>` is accepted only when an
imported module declares that tag and the Host explicitly registers the locked Surface
implementation. The current registry is for trusted official/in-process use; it is not a security
sandbox for third-party parser code.

```svml
<svml>
  <import from="@svml/script@0.0.0-dev"/>

  <script id="story">
    <opening><ALICE>Hello.</opening>
  </script>
</svml>
```

Decoding has two passes. `discoverText` reads only the root and complete leading Import Prologue.
After Driver supplies one immutable resolved closure, `decodeText` freezes the visible Surface
scope and parses the body. A raw Surface receives the source cursor immediately after its opening
tag and must return the cursor after its own close; a structured Surface receives Text's generic
element tree.

A Surface may contribute three kinds of inert data:

- authored typed Record drafts;
- parser-independent Author Component drafts;
- content-addressed Graph Fragments used by those components.

Text validates source ranges, duplicate identities, Manifest-declared Record types and complete
Fragment references. It strips diagnostic ranges before sealing one `svml.author-module@1`, so
source reflow does not change author semantics. It never expands a Fragment or resolves a component
input while reading the body. After every declaration has been collected, `@svml/elaborator`
resolves forward references and emits the Core Graph.

Direct `decodeText()` calls require every source import to be supplied as an already resolved
namespace. The reference `compileSourceClosure()` orchestration in `@svml/elaborator` recursively
discovers those SourceUnits, selects the exact `using` Frontend, decodes dependencies first and then
calls Text with their locked public exports. Text itself never reads a file or guesses a Frontend.
