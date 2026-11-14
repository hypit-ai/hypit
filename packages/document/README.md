# `@hypit/document`

Markdown-first Author Document Frontend for `.svml` files. It owns document-native blocks and inline
runs; it does not turn prose into Records, Components or AuthorGraph Operations.

Select it with the irreducible Source Header and write the document directly after it:

```svml
<?svml using="@hypit/document"?>
# Production notes

This file is already a complete document with **bold**, *italic*, ~underline~,
~~strikethrough~~, `code`, [links](https://hypit.ai), lists, tasks, quotes, tables,
fenced code, formulas and dividers.
```

The public tree follows the useful part of Feishu Docs' model: ordered block nodes contain inline
runs and marks. Markdown is the reversible source spelling, not an opaque text declaration. Opening
and printing an untouched document is byte-for-byte stable. Document block operations rewrite only
the addressed root block and preserve all untouched bytes.

The accepted baseline is CommonMark plus GFM tables, task lists, strikethrough, autolinks and
footnotes, fenced math, Feishu-style `~underline~`, and ATX headings from level 1 through 9. Raw HTML
is intentionally rejected: document packages and future embedded author modules own interactive
behavior instead of executing arbitrary markup.

The first release is deliberately document-only. It discovers no package imports and decodes to an
empty AuthorGraph. Later executable author islands can extend this Frontend without making prose a
component or weakening package-owned declaration semantics.
