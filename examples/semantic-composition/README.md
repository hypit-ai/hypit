# Project-owned audiovisual component

The current executable example in this directory is
[`packages/audiovisual-title-card`](packages/audiovisual-title-card/README.md). It demonstrates one
project package participating in both authoring and the flat HTML-effects NLE without adding a
component enum to either system.

The package owns:

- a typed `TitleCardSpec -> ProgramSource` Producer;
- its independent HTML implementation;
- an optional Block author declaration;
- NLE Component and terminal resolvers;
- optional parameter editing for title, subtitle and colours.

The persistent NLE stores direct exact rational `start`, `duration` and Item-local `sourceTime.pieces` plus the
package symbol and canonical parameters. Opening and editing the project does not compile the Block
declaration. Export resolves the installed package, lowers the Item to AVIR and selects a terminal
frame rate separately from the project's `editRate`.

Run its tests from the repository root:

```bash
node --import tsx --test examples/semantic-composition/packages/audiovisual-title-card/test/*.test.ts
```

The older `chat-scene`, `responsive-explainer`, `.svml` and `.svs` files remain historical design
fixtures from the retired Composition/Timeline API. They are intentionally outside the current
workspace, distribution and root type-check surface; do not use them as package templates.
