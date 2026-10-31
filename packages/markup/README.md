# `@hypit/markup`

XML-like Author Frontend for `.svml` source units. The filename suffix does not select a parser;
the Workspace binds this Frontend explicitly, normally through
`<?svml using="@hypit/markup@1"?>`.

Markup owns the `<svml>` envelope, the leading import prologue, tag and attribute syntax, and the
lossless author document. Package semantics belong to `@hypit/author` declaration compilers.

## Package declarations

An imported package contributes two independent facts:

- an Author declaration compiler defines fields, children, bindings, outputs and compilation;
- a Markup declaration facet assigns that declaration a tag spelling.

The facet ABI is `hypit.markup-declaration@1`. Its implementation contains the Module reference,
declaration name, tag and optional `body: "opaque"` parsing mode.

```ts
createMarkupDeclarationFacet({
  module: { name: "@example/text", version: "1" },
  declaration: { name: "document", tag: "Document" },
});
```

`MarkupDeclarationRegistry` stores these spellings. `createMarkupDeclarationAuthorFrontend()` uses
that registry together with an `AuthorDeclarationRegistryLike`; Markup does not interpret a
package's declaration or graph semantics.

## Author syntax

Imports precede body declarations:

```svml
<?svml using="@hypit/markup@1"?>
<svml>
  <import from="@example/text@1" as="text"/>
  <import source="./shared.svml" as="shared"/>

  <text:Document id="story" source={shared.copy}>
    Hello.
  </text:Document>
</svml>
```

`from` selects a logical Module ABI. `source` imports another decoded Source and requires an `as`
alias. A source import exposes only that Source's public bindings; it is not textual inclusion.
Markup receives resolved modules and source dependencies from the Compiler Host and does not read
files or select parsers. One logical Module may be imported only once in a Source, and two imports
may not bind the same tag spelling; Markup reports the ambiguity instead of choosing by import order.

Attribute values are quoted strings or whole-value references such as `source={shared.copy}`.
Braces contain a binding path, not JavaScript. Structured text and quoted attributes decode the
standard `lt`, `gt`, `amp`, `quot` and `apos` entities. Comments use `<!-- ... -->`.

Source order does not determine declaration dependencies. Markup first projects the complete
document to Author declarations. `@hypit/author` then resolves their symbolic bindings and compiles
them in dependency order.

## Structured and opaque bodies

Structured declarations receive decoded text, ordered children and package-neutral field values.
Their compiler shape determines which fields and children are valid.

An opaque declaration receives the exact text between its opening and closing tags. This is useful
when a package owns a continuous embedded language. The Markup registry needs `body: "opaque"` so
the parser can find the declaration boundary without interpreting the body.

## Author document

`parseMarkupDocument()` retains comments, whitespace, quote spelling, attribute order, body text and
source spans. `printMarkupDocument()` returns the untouched source byte-for-byte.

`createMarkupDocumentFrontend()` projects that representation to the neutral Author Document model.
Its operations edit only the addressed ranges: fields, body text, declarations and imports. Field
addition and replacement are distinct operations, so an editor cannot silently turn a stale replace
into a new field. The neutral projection includes current imports; clients do not inspect the opaque
Frontend representation to discover them. Package
tags used for insertion are resolved from the same `MarkupDeclarationRegistry` used for parsing.
Opaque text is written verbatim; structured text is entity-escaped.

The document indexes nested package children and their structured containers. Field edits,
deletion and movement address the same revision-scoped node IDs at each depth. `insert-child`
accepts the package-owned child grammar; inserting into a self-closing container expands it.
A move preserves the child's authored content and leading comments. The destination `before`
node must be a direct sibling, and moving a container into its own subtree is rejected.

## Assets and source dependencies

Declaration compilers receive the Host's narrow `resolveAsset()` and optional `readAsset()`
capabilities. Markup does not expose filesystem paths, package-manager state or resource discovery.

`decodeMarkupDeclarations()` accepts already decoded source imports. Each `<import source="..."
as="..."/>` must match one supplied dependency exactly before its exports enter declaration scope.
The Compiler owns recursive source discovery and calls each dependency through its selected
Frontend.
