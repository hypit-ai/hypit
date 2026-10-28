# `@hypit/run`

Syntax-neutral decoding of saved invocation presets.

This package is outside Core and knows no XML, filename suffix, video type, Provider or Runtime
configuration. A registered `RunFrontend` decodes one source containing an Author source locator,
Targets and optional transient overrides. Resolution against the compiled Author Source produces a
source-neutral `hypit.invocation@1` value:

```text
saved preset + compiled Author Source -> Invocation { targets, overrides }
```

An override selects either the AuthorGraph primary or an existing authored Record. Public presets
never contain hygienic Candidate ids. CLI arguments and Studio sessions can construct the same
Invocation without saving a Run source.

The optional XML-like spelling lives in `@hypit/markup/run`. Its `<override>` element requires an
explicit `primary="true"` or `record="…"` choice.

The current decoder also recognizes candidate declarations, Run Fragments and `<satisfy>` while
repository sources are migrated. They are isolated from the Invocation ABI and must not be used as
new extension points. Long-lived files and accepted Result values belong in the Author Document;
project files enter through ordinary package-owned Author declarations. Historical Result values
are repository migration inputs, not a permanent Author conversion protocol.
