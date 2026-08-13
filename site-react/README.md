# site-react

A React rebuild of the Narratage website, kept as a standalone app alongside
the existing VitePress site in `docs/`.

**This does not replace `docs/`.** The two sites are separate: `docs/` is the
VitePress site that builds and deploys today, and nothing in this directory is
wired into it. Treat this as a parallel implementation to evaluate, not a
migration that has already happened.

## Run it

Node 22+ and npm. From this directory:

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
```

It has its own `package.json` and dependency tree, and is deliberately outside
the pnpm workspace — installing here does not touch the monorepo's packages.

## What is here

```
site-react/
├── app/
│   ├── page.tsx            home page
│   ├── guide/[slug]/       one dynamic route for all 17 doc pages
│   ├── design/             design-system reference
│   └── timeline/           multi-track timeline preview
├── components/
│   ├── demo/               the three interactive SVML demos
│   ├── DocPage.tsx         markdown renderer + page chrome
│   ├── DocsLayout.tsx      sidebar, table of contents, sections
│   ├── Timeline.tsx        multi-track editing timeline
│   └── …                   header, footer, hero, carousel
├── content/
│   ├── en/                 English docs, markdown
│   └── zh/                 Chinese docs, markdown
└── public/demo/            demo media (6.5 MB)
```

## Notes for whoever picks this up

**The demos are ports, not rewrites.** `SemanticVideoDemo`, `RankingDemo` and
their helpers follow the upstream Vue components in `docs/.vitepress/theme/`
closely — same timing data, same interaction model. The main structural
difference is that per-frame playback state lives in refs and is written
straight to element style: sixty React state updates a second would stall the
render loop.

**Docs are markdown, copied from `docs/`.** `content/en` and `content/zh` hold
the Quickstart and Develop pages as they were at the time of the copy. They are
not symlinked or generated, so upstream edits to `docs/` do not reach them.

**Syntax highlighting matches upstream.** Shiki runs at build time with the
same `svs` TextMate grammar and the same SVML semantic-marker transformer as
`docs/.vitepress/config.ts`, so code blocks render identically.

**Colour, type and spacing are documented at `/design`.** That page reads its
own CSS custom properties at runtime, so it cannot drift from `app/globals.css`.

## Known gaps

- `/timeline` and `/design` are standalone routes, not linked from the nav.
- The `Playground` entry in the header and footer is listed but not linked.
- Demo media is committed here rather than fetched, which is why the directory
  is 8 MB.
