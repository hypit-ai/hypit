# Production project

This is the smallest complete example of the recommended Hypit project boundary. One directory owns
one production, while each subsystem keeps its own file and semantics:

- `generation.graph.json` is the long-running generation dependency graph.
- `generation.canvas.json` is only the saved spatial view of that graph and selected Build outputs.
- `media/` contains portable Media Asset bundles accepted into the production.
- `film.nle.json` is the directly editable media-and-effects timeline.
- `packages/` is where production-specific components belong.
- `scripts/` is for explicit one-way materialization or batch editing helpers.
- `hypit.runtime.json` selects a local deployment; credentials and execution state stay outside the
  authored files.

The project root is marked by `hypit.project: true` in `package.json`. Install dependencies with the
ordinary package manager and commit its lockfile in a real production. `.hypit/` is disposable local
execution/history state, and `exports/` contains viewing deliverables; neither is an authored input.

There is intentionally no central project manifest that lists all of these files. Paths are declared
only by the file that consumes them: the Canvas points to the Graph, the Graph and NLE point to Media
Assets, and each Media Asset points to its own bytes and optional representations.

The checked-in poster demonstrates the acceptance seam. `poster.media.json` owns the media facts,
the Graph loads its primary file as a model input, and the NLE uses the same asset in the accepted
cut. Building `campaign-variation` does not mutate the NLE. An author may inspect the exact Build
output on the Canvas, then explicitly materialize an accepted output into a new `media/<asset>/`
bundle and edit `film.nle.json` to use it.
