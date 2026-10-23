# `@hypit/source`

The byte-oriented Source contract shared by Author and Run compilation.

`SourceUnit` contains opaque bytes and Workspace-canonical identity. `ResolvedSource` pairs those
bytes with the exact trusted Frontend selected by the caller, Workspace mount or package Source
export. Source itself never guesses from a suffix or body and has no default parser.

`SourceRange` is owned here because offsets locate authoring syntax inside a Source; graph Protocol
values remain independent of parsers, text encodings and editor positions.

A `SourceAssetRequest` carries the written locator, media type, optional package-owned bytes and
source range. The Workspace resolves it directly to one Protocol `BlobRef`; byte transfer,
attachment identity and physical storage remain with the Workspace.

`@hypit/source/text` is the optional adapter used by Hypit's self-described UTF-8 author files. It
recognizes one bounded Header such as:

```xml
<?svml using="@hypit/markup@1"?>
```

The adapter masks the Header while preserving UTF-16 offsets and line breaks. Other Workspaces can
produce `ResolvedSource` directly and need not use text or a Header. Neither entry recognizes
imports, XML, Script, Recipes, Run syntax or domain Types; those belong to the selected Frontend.
