# Audiovisual Title Card project component

This project-owned package demonstrates the NLE extension boundary without defining Source syntax or a
Studio UI. One component instance has two package-owned projections:

```text
NLE Component Item + direct parameters
├─ resolver -> ProgramSource
└─ HTML terminal resolver -> AudiovisualHtmlSource
```

The `ProgramSource` contains only the component's finite local temporal Domain, Picture type and local
spatial Domain. It does not contain DOM, Canvas, Track, Clock or renderer state. An
The lowered `AudiovisualProgram` uses that public Source through an ordinary Occurrence and explicit spatial Mapping.
The HTML terminal explicitly receives the package-owned typed implementation value; AVIR does not switch on a
component kind or inspect the package's title-card vocabulary.

The package contributes an `hypit.nle-package` Component resolver. A flat
NLE project keeps one title-card item with direct start, duration, rectangle and parameters; only export asks
the installed project package to produce its `ProgramSource` and HTML implementation. No Build graph is needed
to open or edit that item.

The same project package independently contributes optional `hypit.nle-authoring` Component-parameter
authoring. It owns `set-title`, `set-subtitle` and `set-colors`, validates non-empty text and six-digit hex
colors, and returns the next canonical Title Card parameters. The generic NLE Host only wraps that result in a
revisioned `item.replace`; Track locks and Session undo remain NLE facts. The component exposes no Canvas handle
or internal HTML node to the parent editor.
