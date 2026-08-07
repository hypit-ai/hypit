# `@narratage/transport-process`

Least-authority JSON child-process transport for trusted local Endpoint packages. It is not an
Endpoint and declares no capability.

- executable path must be absolute;
- `shell` is always disabled;
- the parent environment is not inherited;
- timeout and output size are mandatory/bounded;
- one canonical JSON document goes to stdin and one comes from stdout.

A WhisperX-local or HyperFrames-local Endpoint may wrap this transport and own the actual request
schema, artifact protocol and Endpoint lifecycle. Author source can never select an executable or
pass shell arguments through this API.
