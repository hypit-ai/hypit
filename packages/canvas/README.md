# Hypit Canvas

A Project Canvas owns generation recipes, input links, card placement, Invocation attachments, and selected Publication outputs. It persists one `*.canvas.json` document.

- `@hypit/canvas` exports the document reader, serializer, revision transaction and Service.
- `@hypit/canvas/node` exports `createNodeCanvas` and `openNodeCanvas` for an open ProjectHost. Each open handle exposes board, node, catalog and history observations, revision transactions, quote, invoke, cancel, preview and adoption.

Card and input changes are atomic. Send `{ expectedRevision, commands }` using the revision from a board observation. Input values are literals, Project Media references, links to selected upstream outputs, or a list of these values for a list port. The Model package owns available fields, output types and request validation.

Invoking a card saves an attachment and starts one request in an explicitly selected Execution Environment. Passing the same Invocation ID again queries the attached address. Choose a completed output for downstream use with `result.select`. Explicit adoption creates a Project Media reference or a timed transcript.

Model packages contribute authoring metadata from their `./hypit` entrypoints. Select the installed packages and palette entries in `hypit.project.json`. Execution capacity comes from the Project's attached Environments.
