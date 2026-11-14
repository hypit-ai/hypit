# `@hypit/generation-authoring`

Generation Authoring owns the path from explicitly resolved author sources to an immutable
Generation Build definition. It is one physical implementation package with four logical modules:

- `source` defines byte-oriented source values and the optional self-described text adapter;
- `workspace` supplies replaceable source and authored-asset sessions, with filesystem support under
  `workspace/node`;
- `author` decodes package-owned declarations and links hygienic graph fragments;
- `compiler` discovers the source closure, coordinates those modules and prepares one selected Build.

These modules remain separate APIs because they have different authorities. They share one npm
ownership and release lifecycle because none is independently deployed or useful as a standalone
Hypit product. Public consumers use the matching `@hypit/hypit/generation/*` subpaths; this workspace
package is an internal implementation identity.

Detailed contracts remain beside this package in [`source.md`](source.md),
[`workspace.md`](workspace.md), [`author.md`](author.md) and [`compiler.md`](compiler.md).
