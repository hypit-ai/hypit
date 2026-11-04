# `@hypit/audiovisual-author`

Parser-independent authoring above the resolved `@hypit/audiovisual` fact layer.

An `AudiovisualAuthorSpec` names Sources and Occurrences, places each Occurrence once, and composes
recursive Picture and Audio expressions. Named expression bindings allow forward references and shared
subgraphs without making declaration order semantic. The linker resolves Host-owned Source and Operator
bindings, derives occurrence-local temporal Domains and exact Maps, then emits one fully validated
`AudiovisualProgram`.

The package deliberately does not parse HCL or XML and contains no Track, lane, frame clock, Script,
Speech, Runtime, Result, Renderer or Studio type. A future textual or block Frontend should produce this
same Author Spec rather than compiling directly to AVIR or Kernel Graph data.

Media, generated material, project components and nested audiovisual Programmes are not different author
node categories here. Their owners resolve each one to a `ProgramSource`; the Author Spec gives that
binding a local name and creates explicit Occurrences from it. Operators follow the same rule: packages
own their implementation programme and input vocabulary, while the author layer only resolves an explicit
typed binding. Source, Picture Operator and Audio Operator values are independent graph inputs; the author
package no longer stores all effects in one static `OperatorBindings` record.
For generated media, a request duration or Provider prediction is never a Source Domain. Only the actual
artifact after media preparation may close the `ProgramSource`; until then the finite author compiler does
not run for that dependent Programme.

`@hypit/audiovisual-media` now supplies the ordinary one-way bridge for the media case. One real
`PreparedMedia` publishes coordinated Picture and Audio Source outputs without copying or changing its
domain. Its Picture remains in the material's own named spatial domain; author expressions use an explicit
spatial `remap` when the Programme picture domain differs, even when both extents are 1920 × 1080.

Occurrence `duration` may be omitted only for full-speed use from Source position zero when every selected
output is a signal with the same exact duration. A constant output has no Source duration, so its finite
Occurrence duration must be explicit; it cannot carry a temporal relation. Any trim, slip, speed change or
unequal audiovisual extent likewise requires an explicit duration. Each selected signal may carry one
clock-free exact relation which resolves only after the real Source domain exists. Chained NLE gestures
collapse into that occurrence relation; they never publish another Source or PreparedMedia value.

The vertical fixture authors generated A-roll, material B-roll and a project motion component, then sends
the compiled Programme through the existing HTML Picture and continuous Audio terminal adapters. No
terminal-specific field or compatibility representation is added to the Author Spec.

`compileAudiovisualAuthorSpec()` is the finite closing function, not a second unknown-value system. The
package now exposes `AudiovisualAuthorSpec`, local binding, binding-set and resolved Programme protocol Types
plus ordinary `create-bindings`, `append-source`, `append-picture-operator`, `append-audio-operator` and
`close-program` Producers. `createAudiovisualAuthorFragment()` expands any static number of Source and Operator
inputs into that fold. Every input is a normal `GraphValueRef`, so it may name an authored Record, a public
output or a future Operation result whose `TypeRef` is known before execution. The closer still receives only
actual resolved values.

The integration deliberately adds no temporal-only `ExtentReference`, nullable Domain or partially filled
Source. Its graph fixture proves that changing a generation request's duration preference leaves the
AuthorGraph and BuildPlan unchanged, while actual 4.9 and 5.1 second Source values produce correspondingly
different finite Programmes.

The nested graph fixture now also connects one actual `PreparedMedia` through the media Source adapter,
closes a child Programme, projects that Programme through `@hypit/audiovisual`'s typed `program-source`
Producer, and closes a parent Programme. The parent receives only the child's public Picture and Audio
Domains; both media-to-child and child-to-parent spatial relations remain explicit.

The repository's project-owned `@example/audiovisual-title-card` package supplies the corresponding
component proof. Its package Producer publishes a finite `ProgramSource`; an ordinary AuthorGraph branch
feeds that value into the same Source fold, and the parent Programme uses it through one Occurrence plus
an explicit component-Space-to-Programme-Space Mapping. A separate logical companion Module publishes the
typed HTML Source implementation, which enters the terminal Source fold only for an HTML target. Neither the
ProgramSource value nor AVIR contains a component kind, DOM, Track or Canvas.

The same vertical graph now continues beyond the parent Programme into both terminal adapters. Media and child
Programme implementations are ordinary typed Source values; Output frame rate, Canvas and audio sample rate are
separate terminal Records. Kernel demand pruning omits either terminal branch when its output is not selected.
