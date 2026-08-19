# `@hypit/model-kit`

Author-model package helper for defining exact generated-media requests without repeating the
nominal Type → Producer → Need → Graph Fragment shell.

`defineExactModelModule` does not make model requests generic. The calling package still owns its
exact fields, constraints, model identity, capability name and validator. The helper adds no
Provider routing, fallback, credentials or Runtime authority.

This is a package-authoring utility, not an author-importable model by itself.
