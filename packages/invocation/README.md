# `@hypit/invocation`

Syntax-neutral decoding of saved invocation presets.

This package is outside Core and knows no XML, filename suffix, video type, Provider or Runtime
configuration. A registered `InvocationFrontend` decodes one source containing an Author source locator,
Targets and optional transient overrides. Resolution against the compiled Author Source produces a
source-neutral `hypit.invocation@1` value:

```text
saved preset + compiled Author Source -> Invocation { targets, overrides }
```

An override selects either the AuthorGraph primary or an existing authored Record, using only stable
author-level references. CLI arguments and Studio sessions can construct the same Invocation without
saving an Invocation Source.

The optional XML-like spelling lives in `@hypit/markup/invocation`. Its `<override>` element requires an
explicit `primary="true"` or `record="…"` choice.

Long-lived project material enters through ordinary package-owned Author declarations and durable
realization choices in the Author Document. Invocation's complete extension surface is Targets and
transient overrides.
