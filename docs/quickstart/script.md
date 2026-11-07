---
title: Script, transcript and captions
description: Keep semantic evidence source-local, then materialize the chosen presentation.
---

Script and transcript data describe language, performance and source-local time. They are valuable
before and during editing, but they are not a second programme timeline.

## Source-local understanding

A Script may name segments, selections, speakers and moments. Speech evidence may attach exact word
or phrase positions in the local domain of one audio source. Narrative timing joins those local facts
without choosing where the source will later appear in an edit.

This lets the same media and transcript be trimmed, reused or placed more than once. A package that
produces the evidence does not need to know the eventual canvas, frame rate or NLE project.

## Materialize captions

Caption authoring chooses the cues and presentation to make visible. An explicit materializer combines
the selected source-local timing with one concrete media occurrence and expands the result into ordinary
caption Component Items.

Each materialized cue stores direct programme placement and package-owned parameters such as text and
style. The parent NLE project contains no live transcript query and no special Caption Track. Several
caption instances may materialize different selections or appearances from the same document.

Once materialized, an editor can move, trim, hide or restyle a cue like another component instance.
Those edits affect the accepted presentation; they do not rewrite the source transcript unless a
separate tool explicitly performs that operation.

## Semantic guides remain optional

An editor may expose word boundaries, selections or moments as snap guides and inspectors. Accepting a
snap writes an exact NLE value. Preview and export do not reverse-resolve a semantic name.

This keeps understanding reusable while the NLE remains flat and immediately editable. More elaborate
caption families or motion graphics build on package-owned components rather than new NLE primitives.

See [Exact time](./timing.md) and [NLE project structure](./tracks.md).
