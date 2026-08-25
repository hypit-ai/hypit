# Promote a project-local package into the Hypit repository

This file says how to judge whether a project-local author package should outlive the video it was
built for, and what promoting it into the Hypit repository costs.

## When the result is accepted, decide whether the package should leave the project

A delivery that shipped may have produced one or more project-local packages on the way. Before
moving on, judge each one and put the question to the author. Not automatically, and not before the
result is accepted — this is an offer, and promoting it is a separate contribution.

**The judgement is one question: would a second, unrelated video want this vocabulary?** A component
that is *this* video's content shaped as a component is not reusable however well it is written — a
sheet whose steps are this product's onboarding, a board whose rows are this ranking. What travels is
a *role* the installed packages do not cover: a Style family that differs from `caption-fine` in its
timing model, a board that differs from `ranking` in the shape of its rows. If the slots are inputs
and the chrome is the component's own, it is probably reusable; if the package would have to be
rewritten for the next video, say so and keep it where it is.

Say which it is either way. A local package nobody flagged is a local package nobody revisits.

### Promotion is not a move

If the author wants it promoted, these are the parts. Say up front that this is a checklist rather
than a path anyone has walked — no package under `packages/` began inside a project, so the first
person to do it should correct what follows.

- **The name is load-bearing in six places.** `@my-project/local-<slug>` becomes `@hypit/<slug>` in
  `package.json`; in the Module ref in `src/manifest.ts`, where renaming it **renames every nominal
  Type and Producer in the Module at once**, because each is built from that one const; in every
  Author Source that writes `import … from "@my-project/local-<slug>@1"`; in the root `package.json`
  `devDependencies`; in the package's own test harness; and in **both** package catalogs,
  `docs/guide/packages.md` and `docs/zh/guide/packages.md`. An English-only catalog entry is a half
  promotion.
- **Studio support is a companion.** A project-owned `@my-project/local-<slug>-studio` may already provide
  rich interpretation. Promotion moves that companion into an official Studio adapter package; it
  never copies its code into `@hypit/studio` and never teaches the domain package about Studio.
- **Its own chrome becomes repository content.** Project package assets already belong to the
  project's Git history. Promotion makes those accepted bytes official package content and must
  deliberately choose their permanent location.
- **It newly owes tests.** The suite globs `packages/*/test/**/*.test.ts`. A local package ships
  `test/render-preview.ts`, which is a harness, not a suite, so a promoted package contributes zero
  coverage where every peer has some. Writing one is part of promotion.
- **It newly owes clean imports.** Repository hygiene requires that anything `src/` imports appears in
  `dependencies`, not `devDependencies` — a rule examples and projects are exempt from. A package
  carrying its render-harness dependencies in `devDependencies` fails on the way in.
- **The workspaces stay separate.** Promotion adds the package to Hypit's `packages/*` and root
  catalog; it never adds the external project or a project glob to Hypit's workspace.

What promotion never means: merging the behaviour into the package it was modelled on. It installs
beside that package as a sibling family, for the reasons the package boundary section of
`local-author-package.md` gives.
