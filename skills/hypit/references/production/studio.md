# Working in NLE Studio and Canvas Studio

Hypit ships two visual browser Product Sessions hosted by `ApplicationHost`:

1. **NLE Studio (`hypit nle open main.svml`)**: interactive timeline, canvas preview, inspector
   controls for installed package components/operators, and MP4 export.
2. **Canvas Studio (`hypit canvas open main.canvas.json`)**: node-based AIGC generation board for
   connecting recipes, inspecting history, selecting Publications, and adopting Media.

## Opening from CLI

```bash
hypit nle open main.svml
hypit canvas open main.canvas.json
# Print the URL without launching a browser:
hypit nle open main.svml --no-open --json
```

## Working in Hypit Desktop

In Hypit Desktop, NLE Studio ("Edit" tab) and Canvas Studio ("Generate" tab) are embedded directly
in the workspace tabs and share the same `ApplicationHost` and `ProjectHost` as the CLI:

- Edits saved via `hypit canvas apply` or written to `*.svml` are visible in the corresponding
  Studio tab.
- Check `FEEDBACK.json` in the project directory for user feedback notes left during review.
- Keep `hypit nle inspect` and `hypit canvas inspect` in sync with the current revision before
  applying programmatic transactions.
