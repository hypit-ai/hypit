# `@hypit/svml`

Lossless SVML Block Frontend. It parses imports, package-qualified root declarations, package-owned nested
declarations, labels and recursive literal/reference/list/record values without knowing any domain vocabulary.

The Frontend projects one revision into `AuthorStructureDocument` and applies exactly four structural edits:
insert, replace, remove and move. Untouched bytes, comments and trivia remain owned by the CST; every edited
candidate is reparsed before it is returned. Package-owned declaration compilers and edit planners provide
meaning, while this package never recognizes Programme, Media, NLE, Canvas or Provider concepts.

The language intentionally has no generic evaluator, variables, interpolation, loops, merge or implicit
inheritance. Computed facts are authored by typed package declarations and connected with explicit references.
