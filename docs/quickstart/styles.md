---
title: Component and effect parameters
description: Packages own visual behavior while the NLE stores editable instances.
---

Hypit does not define one central style language for every visual role. A title card, caption family,
picture filter, transition and audio effect each own the parameters needed by their behavior.

An NLE Component or Effect instance stores:

- the exact package module symbol;
- a name within that module;
- canonical JSON parameters owned by that package.

For example, a title component may own copy and colors, while a filter owns opacity, blur and its own
Item-local keyframes. NLE Core preserves these values but does not interpret their spelling.

## Editing package parameters

Package code may contribute an authoring adapter that inspects its current parameters and plans a new
value from an edit operation. The NLE host turns that result into an ordinary revisioned Item replacement,
so project locks, validation, undo and save semantics remain authoritative.

Canvas handles and custom panels are optional capabilities. Many effects need only parameter controls;
they do not have to pretend that dragging a rectangle has useful meaning.

## Author Recipes and NLE instances

SVS Recipes can still parameterize Author components in an AIGC or source-compilation workflow. They
belong to that declarative graph. Once a component is materialized into an NLE project, the accepted
instance contains direct package parameters rather than a live Recipe lookup.

This separation keeps packages decentralized: adding a new component or effect requires its package,
not a new NLE kind or a change to the renderer's project grammar.

See [Adding an Author Package](../guide/author-packages.md) and
[NLE project structure](./tracks.md).
