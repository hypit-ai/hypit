# `@svml/cli`

Official v2 command-line assembly.

Unlike `@svml/compiler-node`, this application is allowed to choose a trusted default prelude. The
current prelude registers:

- the official Text Frontend;
- the Script raw Surface and its audiovisual Narrative contract dependency;
- the SVS alternate Frontend and generic Recipe manifest;
- the official Film and HyperFrames Render Structured Surfaces plus their exact static dependencies.

It does not place these packages in Core and does not grant source imports network, credential or
process permissions.

From the repository:

```bash
pnpm svml:v2 check path/to/main.svml
pnpm svml:v2 plan path/to/main.svml --target component.result
```

`check` is usable for the implemented Script, Film, Render and recursively imported `.svs` sources.
`plan` is fully implemented by the generic Node compiler. A complete author video still awaits the
generation, Speech and Track Surfaces that produce Film's inputs; the CLI does not fabricate those
missing facts.

Automatic installation/loading of arbitrary community packages is deliberately absent. The first
CLI runs only trusted official code; a future lock-aware loader and isolated Worker must extend the
Host without changing Core or the Source Closure ABI.
