# `@hypit/project-cli`

The direct project-boundary command adapter for the official Hypit application.

```text
hypit project init [directory] [--name <package-name>]
```

It marks one ordinary npm package as one Hypit production and creates a conservative `.gitignore`
when absent. It does not create a central project manifest, Runtime Profile, Generation Graph,
Canvas, NLE, Media Asset, package lockfile, or component package. Those files remain owned by their
subsystems and normal package management.

The command can adopt an existing valid `package.json`; it preserves every existing field and only
sets `hypit.project` to `true`. Existing `.gitignore` files are never rewritten. Repeating the command
on an already marked project is idempotent.
