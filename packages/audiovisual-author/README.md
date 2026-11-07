# `@hypit/audiovisual-author`

Parser-independent authoring above the resolved `@hypit/audiovisual` fact layer.

An `AudiovisualAuthorSpec` names Sources and Occurrences, places each Occurrence once, and composes
recursive Picture and Audio expressions. Named expression bindings allow forward references and shared
subgraphs without making declaration order semantic. The linker resolves Host-owned Source and Operator
bindings, derives occurrence-local temporal Domains and exact Maps, then emits one fully validated
`AudiovisualProgram`.

The package deliberately does not parse SVML Block or XML and contains no Track, lane, frame clock, Script,
Speech, Runtime, Result, Renderer or Studio type. Its package-owned `Program` declaration compiler consumes
syntax-neutral Author Declarations and produces this same Author Spec plus the existing fixed Graph Fragment;
`@hypit/svml` owns parsing and lossless writeback.

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

One parent-free `AudiovisualAuthorOccurrenceUse` now closes the actual Source, its local Domain, selected
output Maps, active range and start before a Programme Domain exists. It publishes `end` and local-position
projections as ordinary exact values. Any later relation may consume those values, including the relation
that creates the Programme Domain; only afterward does a separate operation attach that finite parent and
seal the resolved Occurrence.

Occurrence time binding has three explicit forms:

- `source` binds a consumer output to one target output's source domain and reuses its complete selected
  `TemporalMap`; this is the ordinary Caption-over-video case and preserves trim, slip, retime, reverse,
  hold and loop.
- `occurrence` gives the consumer the target occurrence's local domain and placement, with identity mapping
  for compatible consumer signals; this is useful for component state defined directly over another
  occurrence rather than one selected source output.
- `event` takes a domain-bearing local event set, computes its bounded preimage through a selected output
  Map, requires exactly one sided point, and uses the projected Programme position plus an optional offset.
  Zero, multiple and hold-region solutions fail instead of hiding a matching policy.

```svml
time { bound: source to: @occurrence.video.picture }
time { bound: occurrence to: @occurrence.scene }
time {
  bound: event
  through: @occurrence.video.picture
  event: @unit-two-start
  require: unique
  offset: 250ms
}
```

The event form also supports a semantic second-level follow without making semantics special: a matcher,
Caption package, tracker, or file adapter may publish local events; a visible component then follows one
event through an already placed occurrence. The author layer knows only domains, Maps, preimages and the
consumer's explicit cardinality requirement.

These operations know neither media provenance nor caption semantics. A component instance remains one
parent Source use and one parent Occurrence unless the author explicitly creates more instances; its internal
cues, rectangles and animation states are not expanded into parent AuthorGraph or NLE objects.

For a closed Programme, `resolveAudiovisualNleSubject` owns the reverse authoring join for
`<programme>.occurrence.<name>.<output>`. It follows the occurrence's authored `source` reference to the
Programme `source` child and then reads that child's exact provenance edge. It never searches for a matching
ProgramSource value or assumes a component package. Signal endpoints additionally return the factual
Occurrence-to-Source `TemporalMap`; constant endpoints correctly have no temporal Map.

The join is available in two phases. `locateAudiovisualNleSubject` resolves the owner edge before Programme
execution, allowing projector outputs to join the same finite Build selection. After closure,
`realizeAudiovisualNleSubject` reads only the selected occurrence output and adds its factual Map. The
one-call resolver remains a convenience for an already closed Programme.

An Operator Control use has a separate syntax-neutral `AudiovisualAuthorControlBinding`. It may follow the
Programme, one Occurrence, or one selected Source output; alternatively an exact author relation is resolved
from the Programme domain into the Operator-owned Control domain. A factual `TemporalMap` may be supplied
directly or through an ordinary future typed graph value. The author package owns only this use relation:
Filter, Transition, Gain and project packages continue to own their Control value, interpolation and Operator
programme. There is no central Keyframe declaration or Control registry in AVIR.

The vertical fixture authors generated A-roll, material B-roll and a project motion component, then sends
the compiled Programme through the existing HTML Picture and continuous Audio terminal adapters. No
terminal-specific field or compatibility representation is added to the Author Spec. Its fixed AuthorGraph
also sends real `PictureFilterControl` and `AudioGainControl` Records through the Producers owned by
`@hypit/picture-filter` and `@hypit/audio-gain`, and sends a Transition Spec plus Control Domain through
`@hypit/picture-transition`. The resulting opaque Operators enter the Programme, where the Transition's
`progress` use closes from an exact author relation.
This is the complete vertical ownership seam: AVIR does not decode any owner value and the owner packages
do not create Occurrences, Programme structure or author identities.

Programme authoring no longer depends on one opaque finite closer. Package-owned fragments now expose the
forward chain as ordinary typed Producers: infer or accept use duration, resolve a parent-free use, project
its end, create the Programme Domain from any explicit boundary value, close each Occurrence against that
Domain, fold the resolved Occurrences, and finally compile only the Picture/Audio graph. Every edge is a normal
`GraphValueRef`, so Kernel planning detects missing values and cycles without a Timeline-specific finalize
phase or an `end` special case. `compileAudiovisualAuthorSpec()` remains a pure convenience API and performs
the same construction steps without publishing a second Graph protocol path. The former aggregate
`close-program` Producer and Source-binding fold have been removed.

Bindings remain only where a variable number of values must enter a fixed fragment, such as package-owned
Operators, reconstructions and authored Maps. Source, start, duration, Programme Domain and closed Occurrence
are explicit typed ports in the new path; they are not hidden in one mutable binding set.

The package-owned Block declaration now exposes the same algebra rather than a reduced NLE dialect:
Picture bindings cover use, transparent, over, apply, restrict, crop and typed Spatial Map remap; Audio
bindings cover use, silence, mix, apply and restrict. Occurrence outputs own exact temporal relations and
optional package-owned reconstruction. Author Control bindings may consume a future typed Temporal Map or name
an author-local coordinate source, but compilation always closes them to factual AVIR `controlMappings` before
the Programme exists. These are declaration mappings to existing values, not new Core transforms or parser concepts.

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
