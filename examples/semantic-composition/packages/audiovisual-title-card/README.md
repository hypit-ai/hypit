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
