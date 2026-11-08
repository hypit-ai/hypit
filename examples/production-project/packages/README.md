# Production packages

Put components created specifically for this production here and install them through the root
`package.json` with an ordinary `file:` dependency. A component package owns its Manifest, Surface,
Producer or AVIR/HTML implementation and preview; the project files only select its logical Module
ABI and parameters. Move a package to its owner's npm scope only when it genuinely needs reuse across
projects.
