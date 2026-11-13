# Decision record: options that were rejected

## 1c — Do not carry the concept through `format`, an existing port, or Endpoint config

Rejected: encoding the concept in a port the service does not honour (`format` is the only other
mutable port on `matte-portrait-video`, and it is an enum of `WEBM`/`MOV`).

Why: a provider that accepts a request it cannot honour fails late and silently — the request is
paid for, the artifact is wrong, and nothing in the Build says so. This is the same class of defect
that Codex flagged on PR #491 (`background: ["transparent"]` reported as supported while never being
sent to Muse), and the same rule the model README states: "It takes no generation prompt or
duration". A request must be refused in `supports()` or honoured end to end; there is no third
option worth shipping.

The accepted alternative is the new model `@hypit/sam-cutout@1#sam-3.1-cutout`, whose `prompt` is a
real port: `hypit check` rejects a missing prompt, `hypit plan` prints the prompt, and the service
receives it.

## 3a — Dual delivery: reachable, via a second selector + second port (superseded finding)

Earlier measurement (kept for the record): the provider returned both artifacts in one
`GeneratedVideoSet`, but only the targeted port was materialized — `result.json` listed a single
`build-file` and no `.mov` existed in `.hypit/`. The correct reading was narrower than "unreachable":
a set entry nobody selects is never stored, and the surface exposed only the primary selector.

Resolution implemented: `@hypit/sam-cutout` now declares its own producer
`select-alternate-video` (reads `videos[1]`, throws when absent) and exports both selectors as Blobs
(`video`, `alternate`). No protocol change was needed — `select-primary-video` is an ordinary
producer, so a sibling is an ordinary producer too.

Measured after the change, one paid call:
  plan: 2 targets, 1 provider request
  `.hypit/results/.../files/`: `file-0002.webm` 53,469 B and `file-0001.quicktime` 9,347,851 B
  primary export: vp9, `alpha_mode=1`, coverage frame 10 = 0.3754
  alternate export: prores 4444, `yuva444p12le`, coverage frame 10 = 0.3754

Two things that had to be right: the handler must unwrap the graph's `StoredValue`
(`kind: "inline"`) before reading `videos`, and the fragment's media input names must come from
`exactModelMediaInputNames("source")` or the author binding names drift from the declared ports.

## 3b — Why the converter is a tool, not a Provider

`@hypit/media-operations@1#transform-media` is documented as "an ordered trim and retime program over
one already normalized SynchronizedMedia value": its ports carry a transform program, not a target
container or codec. Implementing container/codec conversion behind it would misrepresent the
capability to every other author on the runtime, so the conversion stays an explicit local step with
its own verification, and can become a model of its own if upstream wants a transcode contract.
