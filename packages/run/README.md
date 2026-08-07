# `@narratage/run`

Syntax-neutral Run Source and complete Run Graph compiler.

This package is outside Core and knows no XML, filename suffix, video type, Provider or Runtime
configuration. Given a self-described source unit, a registered `RunFrontend`, an already compiled
Author Source and trusted Run Fragment registry, it produces:

```text
RunSourceClosure + RunDocument -> complete RunGraph
```

The Run Graph always exists and binds the exact Author Graph. It contains Run Candidates,
Operations, explicit Satisfaction edges, all named Target sets and the selected Target set. A run
that selects only primary Candidates therefore still has identity and cannot be replaced by hidden
CLI flags.

`RunSourceClosure` separately binds original source bytes, Frontend id/implementation and decoded
semantic meaning. `RunFragmentRegistry` accepts trusted Fragment packages only through the
`svml.run-fragment-host@1` Host-facet installer. Package loading does not interpret Fragment code.

The optional official XML-like syntax lives in `@narratage/run-text`. Another trusted Frontend can emit
the same `RunDocument` without changing this package or Core.
