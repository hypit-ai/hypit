# `@hypit/markup`

Official XML-like Author Frontend normally used by `.svml` source units. The suffix has no parser
authority; a mandatory `<?svml using="@hypit/markup@1"?>` Header selects this Frontend. It owns only the `<svml>` envelope,
the leading Import Prologue, namespace binding, generic structured elements and dispatch to
package-owned Markup Surface Host facets.

The package has no built-in Script, media or video vocabulary. `<script>` is accepted only when an
imported package contributes that tag through a locked Markup Host facet. The semantic Module
Manifest contains no XML or parser fact. The current registry is for trusted official/in-process use; it is not a security
sandbox for third-party parser code.

```svml
<?svml using="@hypit/markup@1"?>
<svml>
  <import from="@hypit/script@1"/>
  <import as="recipes" source="./recipes.svs"/>

  <script id="story">
    <opening><ALICE>Hello.</opening>
  </script>
</svml>
```

## Author syntax

Imports must precede body declarations. `from="@scope/package@1"` selects a logical Module ABI from
an installed package; `source="./other.svs"` selects another SourceUnit. A Host may also resolve a
non-relative Source locator such as an explicitly exported package Source; this is the same Markup
construct and does not give Markup package-manager knowledge. An `as` alias prefixes that module's
tags or that Source's public bindings. A Source import is not textual inclusion and does not make
its private graph identifiers public. Aliasing does not rewrite authored Narrative
identities: separately declaring two Scripts named `story` in one closure is a conflict, even when
their binding paths use different import aliases.

Attributes are quoted strings or whole-value references such as `source={portrait.image}`. Braces
contain a binding path, not JavaScript. The receiving Surface owns literal number/boolean parsing,
expression units, allowed children and output names. There is no universal `.image` or `.track`
suffix. Generic structured text and quoted attributes decode `&lt;`, `&gt;`, `&amp;`, `&quot;` and
`&apos;`; a raw Surface such as Script owns its own body grammar and escapes. Comments use
`<!-- ... -->` outside raw bodies.

Put values before structured Surfaces that resolve them. During decoding, `resolveReference` sees
imported public values, earlier authored Records and earlier Component output declarations. It can
inspect an inline Recipe immediately but cannot inspect a generated value that has not run.
Arbitrary forward references are not a general author-language guarantee. These declaration-order
requirements are distinct from execution order, which follows graph dependencies and demanded
Outputs.

## Frontend implementation

Decoding has two passes. `discoverMarkup` reads only the root and complete leading Import Prologue.
After Driver supplies one immutable resolved closure, `decodeMarkup` freezes the visible Surface
scope and parses the body. A raw Surface receives the source cursor immediately after its opening
tag and must return the cursor after its own close; a structured Surface receives Markup's generic
element tree.

A Surface may contribute three kinds of inert data:

- authored typed Record drafts;
- parser-independent Author Component drafts;
- content-addressed Graph Fragments used by those components.

Raw and Structured Surface handlers are asynchronous and receive one narrow `resolveAsset()`
capability. This is the only way a Surface can turn an author-written asset locator into a
content-addressed `BlobRef`; Markup never exposes filesystem APIs or a resolved local path. The
Compiler Host, not the Surface, owns containment, read-once behavior and byte transfer. A handler
that does not request assets remains unchanged apart from being awaitable.

Markup validates source ranges, duplicate identities, Host-facet-declared Record types and complete
Fragment references. It strips diagnostic ranges before sealing one `hypit.author-module@1`, so
source reflow does not change author semantics. It does not expand Fragments while reading the
body. Surface handlers can resolve references through the scoped decoder context described above;
after all drafts are collected, `@hypit/elaborator` resolves their graph wiring and emits the Core
Graph. That later graph pass does not make future authored Records available to an earlier decoder.

Direct `decodeMarkup()` calls require every source import to be supplied as an already resolved
namespace. The reference `compileSourceClosure()` orchestration in `@hypit/elaborator` recursively
discovers those SourceUnits. Each dependency's own Source Header selects its exact Frontend; Markup
never chooses a dependency parser. The compiler decodes dependencies first and then calls Markup
with their locked public exports. Markup itself never reads a file or guesses a Frontend.
