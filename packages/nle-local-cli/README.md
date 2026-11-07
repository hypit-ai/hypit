# `@hypit/nle-local-cli`

CLI adapter for direct local NLE file export.

The executable supplies the optional read-only Distribution package root when it creates the
command module. The adapter opens no Build or Runtime and keeps terminal parsing outside
`@hypit/nle-local`.
