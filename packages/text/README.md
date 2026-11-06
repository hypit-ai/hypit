# `@hypit/text`

The exact ordinary text value shared by Script, speech and components that explicitly accept dynamic copy.

Text is not a prompt, a visual title declaration or a template language. Static component copy stays in the
component that owns it. Model instructions are authored as `@hypit/prompt` values, while Prompt slots may
consume Text produced by Script or another explicit graph edge.
