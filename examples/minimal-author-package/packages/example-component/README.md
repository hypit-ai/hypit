# Example component fixture

This is the smallest complete author-package fixture. It is the canonical generic-package reference,
not a production component or a video example.

It contains a Module Manifest with nominal Types and deterministic Producers, validators, a structured
Surface decoder returning `records`, `components`, `fragments` and `exports`, and sealed Fragments with
literal `fragment-input`, `fragment-operation` and `output` references. `src/temporal.ts` shows the
Surface-side `@hypit/temporal-markup` Window/Moment projections; that package is distinct from the
graph-side `@hypit/temporal` Producers.

The three Surfaces demonstrate a box, a text surface and a media slot. The slot is a graph input; it is
not a file bundled by the package. `preview/Box.png` is a real catalogue frame supplied by the
package's vocabulary.
