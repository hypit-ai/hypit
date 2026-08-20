# Hypit source authoring

Read `quickstart.md`, then the authoritative page it selects under `docs/quickstart/`.
Keep Author Source, Recipe Source and Run Source complete and internally consistent rather than
assembling independent per-shot source fragments.

Before writing an element, read the owning package README and, when available, inspect its current
vocabulary declaration. For `@hypit/<name>@1`, the repository README is
`packages/<name>/README.md`. Never invent a component, attribute, child, port, Recipe property or
literal value. Do not infer one package's syntax from a neighboring package.

Install dependencies after package selections change. Validate with the existing command:

```bash
pnpm hypit check path/to/source
```

Do not create a check wrapper. A successful check establishes legal syntax, references and graph
structure; it does not prove that an uncertain video observation was semantically correct.

This file is about writing an element correctly, which is a narrower question than making the video
right. What a Track should contain, when a picture may be generated at all, how long a thing stays on
screen and what shows through when it does not — those are decided in `playbooks/index.md`, whose
required load order names the craft every program needs regardless of format. A Source can pass
`hypit check` with every one of those decisions still unmade.
