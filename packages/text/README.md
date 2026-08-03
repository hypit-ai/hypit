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
element tree. Text seals each returned draft as an authored typed Record with separate source,
frontend-closure and semantic identities.

Source imports using another codec are discovered by the syntax but intentionally rejected by the
current decoder until Driver owns recursive SourceUnit resolution.
