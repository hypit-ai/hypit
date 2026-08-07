# `@svml/text`

Official XML-like Author Frontend normally used by `.svml` source units. The suffix has no parser
authority; a mandatory `<?svml using="@svml/text@1"?>` Header selects this Frontend. It owns only the `<svml>` envelope,
the leading Import Prologue, namespace binding, generic structured elements and dispatch to
statically declared module Surfaces.

The package has no built-in Script, media or video vocabulary. `<script>` is accepted only when an
imported module declares that tag and the Host explicitly registers the locked Surface
implementation. The current registry is for trusted official/in-process use; it is not a security
sandbox for third-party parser code.

```svml
<?svml using="@svml/text@1"?>
<svml>
  <import from="@svml/script@1"/>
  <import as="studio" source="./studio.svs"/>

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

Raw and Structured Surface handlers are asynchronous and receive one narrow `resolveAsset()`
capability. This is the only way a Surface can turn an author-written asset locator into a
content-addressed `BlobRef`; Text never exposes filesystem APIs or a resolved local path. The
Compiler Host, not the Surface, owns containment, read-once behavior and byte transfer. A handler
that does not request assets remains unchanged apart from being awaitable.

Text validates source ranges, duplicate identities, Manifest-declared Record types and complete
Fragment references. It strips diagnostic ranges before sealing one `svml.author-module@1`, so
source reflow does not change author semantics. It never expands a Fragment or resolves a component
input while reading the body. After every declaration has been collected, `@svml/elaborator`
resolves forward references and emits the Core Graph.

Direct `decodeText()` calls require every source import to be supplied as an already resolved
namespace. The reference `compileSourceClosure()` orchestration in `@svml/elaborator` recursively
discovers those SourceUnits. Each dependency's own Source Header selects its exact Frontend; Text
never chooses a dependency parser. The compiler decodes dependencies first and then calls Text with
their locked public exports. Text itself never reads a file or guesses a Frontend.
