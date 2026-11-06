# Audiovisual Title Card project component

This project-owned package demonstrates the new NLE backend boundary without defining Source syntax or a
Studio UI. One component instance has two package-owned projections:

```text
TitleCardSpec
├─ title-card-source Producer -> ProgramSource
└─ title-card-html-source Producer -> AudiovisualHtmlSource
```

The `ProgramSource` contains only the component's finite local temporal Domain, Picture type and local
spatial Domain. It does not contain DOM, Canvas, Track, Clock or renderer state. An
`AudiovisualProgram` uses that public Source through an ordinary Occurrence and explicit spatial Mapping.
The HTML terminal explicitly receives the package-owned typed implementation value; AVIR does not switch on a
component kind or inspect the package's title-card vocabulary.

The two owner projections are independent logical Modules in one project package. Author compilation demands
only the typed Source Producer. HTML compilation demands the companion Producer and folds its result into the
terminal compile graph. A build that never selects the HTML terminal does not execute that branch. No central
registry, component kind or materialized Surface joins the two projections.

The package also owns the Block declaration `title.Card "name" { ... }`. Its label is the Source identity;
the declaration creates the package's `TitleCardSpec` and Source-producing component without teaching SVML,
the audiovisual author package or a View what a title card is.

For the persistent NLE path the package also contributes an `hypit.nle-package@1` Component resolver. A flat
NLE project keeps one title-card item with direct start, duration, rectangle and parameters; only export asks
the installed project package to produce its `ProgramSource` and HTML implementation. No Build graph is needed
to open or edit that item.

The same project package independently contributes optional `hypit.nle-authoring@1` Component-parameter
authoring. It owns `set-title`, `set-subtitle` and `set-colors`, validates non-empty text and six-digit hex
colors, and returns the next canonical Title Card parameters. The generic NLE Host only wraps that result in a
revisioned `item.replace`; Track locks and Session undo remain NLE facts. The component exposes no Canvas handle
or internal HTML node to the parent editor.
