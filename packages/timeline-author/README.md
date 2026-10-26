# `@hypit/timeline-author`

Construct one finite absolute Timeline from a small acyclic graph of named Instants and Windows.
This package owns author syntax and lowering; [`@hypit/timeline`](../timeline/README.md) owns only the
completed value `{ id, frameRate, frameCount }`.

The official video Distribution installs this package as an ordinary default npm dependency. Its
parser, construction Points and construction Extents remain package-owned. The package reuses
Timeline's ordinary `FrameSpan` while assembling Windows; downstream components consume only the
public Timeline, Window and Instant values. Core and the Timeline value package do not know this
author syntax exists.

Timeline is not a media Track, clip list, semantic anchor registry or hidden schedule. Its author
graph does only two jobs:

1. resolve the program's exclusive `end`; and
2. publish deliberately named absolute Instants and Windows for other graph nodes to consume.

```svml
<import as="time" from="@hypit/timeline-author@1"/>

<time:Clock id="clock" frame-rate="30"/>
<time:Timeline id="program" clock={clock}
  end="latest(speech.end,outro.end)">
  <time:Window id="speech" from="start" for={voice.extent}/>
  <time:Instant id="claim" at="speech.end-12f"/>
  <time:Window id="outro" from="claim" for="3s"/>
</time:Timeline>
```

The Timeline declaration publishes:

- `program.timeline`, the completed Timeline;
- `program.window`, `program.start` and `program.end` for the complete range;
- `program.speech`, plus `program.speech.start` and `program.speech.end`;
- `program.claim`; and
- `program.outro`, plus its boundaries.

Every named child is naturally addressable. There is no author-facing `export` attribute. Internal
construction Points and Extents are compiler values; intermediate intervals use the same
`FrameSpan` as every other finite frame domain and never become another public time model.

## Timeline declarations

| Form | Meaning | Published value |
| --- | --- | --- |
| `<time:Instant id="cue" at="…"/>` | Names one absolute boundary relationship. | `program.cue` |
| `<time:Window id="tail" from="…" for="2s"/>` | Names one non-empty absolute interval relationship. | `program.tail`, `.start`, `.end` |

A Window supplies exactly two of `from`, `until` and `for`. `for` accepts either an exact duration
literal or a typed `TemporalExtent`. This gives forward placement, end alignment and intervals
between existing boundaries without separate Block, Before, After or Place primitives:

```svml
<time:Timeline id="film" clock={clock} end="latest(voice.end,tail.end)">
  <time:Window id="voice" from="start" for={voice-media.extent}/>
  <time:Window id="last-three" until="end" for="3s"/>
  <time:Window id="tail" from="voice.end" until="voice.end+3s"/>
</time:Timeline>
```

## Point expressions

`Instant.at`, Window boundaries and the required Timeline `end` share one restricted expression
grammar:

| Expression | Meaning |
| --- | --- |
| `start` | frame boundary zero |
| `12f`, `250ms`, `1.5s` | absolute position from zero |
| `speech.start`, `speech.end` | boundary of a named Window |
| `claim` | a named Instant |
| `claim+2s`, `speech.end-12f` | exact literal offset |
| `earliest(a,b)`, `latest(a,b,c)` | earliest or latest of named boundaries |

Declarations may refer forward. Source order is not execution order; dependencies determine graph
evaluation. `end` may also be referenced by a Window such as `last-three`. If `end` then depends on
that same Window, the author graph contains a real cycle and is rejected. Unknown references,
non-positive Timeline ends, non-exact frame durations, empty Windows and values outside the final
range are errors.

The graph may have several roots, branches and leaves. It needs no clip ordering or single content
root; it needs one resolvable `end`.

## Studio inverse

Timeline Author retains the exact child declaration and binding on private literal Duration and
Offset Specs. Its Studio Companion owns the inverse relations for private construction Points and
Extents and for the shared FrameSpan that connects them. Studio can therefore follow a consumed Window back through the executed author
graph without learning Timeline Author's Producer vocabulary.

For `from + for`, moving keeps `for` unchanged; trimming the leading edge rewrites `from` and `for`
atomically so the old end remains fixed. `until + for` is the corresponding end-anchored relation,
while `from + until` exposes both boundaries. A bare reference follows its upstream producer. An
explicit offset owns only that offset expression. `earliest` and `latest` remain read-only when a
change would require choosing among inputs; Studio does not guess which branch the author intended.

These inverse facts are package-local Studio support. They do not change the Timeline value, add an
editing concern to Core, or create a second author graph.

## Unknown generated duration

`TemporalExtent` is an unpositioned exact duration with no output frame rate. Media preparation
publishes it only after an imported or generated asset is available. A Timeline Window can consume
that ordinary graph value, so an unknown voice or video length may determine later boundaries and the
final `end` without a phase state machine, callback or second Source run:

```svml
<time:Timeline id="film" clock={clock} end="outro.end">
  <time:Window id="voice" from="start" for={voice-media.extent}/>
  <time:Window id="outro" from="voice.end" for="3s"/>
</time:Timeline>
```

If generation itself requests this Timeline's end while the end depends on the generated result,
that is a genuine dependency cycle rather than a scheduling problem.

Timeline Author owns the conversion from the exact Extent to its selected Clock. The stable default
is `cover`: its compiler writes that policy as a private construction input, and a duration between
two frame boundaries retains the final partial frame. Literal frame
durations remain exact author coordinates. Other consumers may deliberately choose `exact`, `inside`
or `nearest`; a Provider does not choose this boundary policy implicitly.

## Local domains contribute, then disappear

A prepared source may supply the `TemporalExtent` that determines a Window. That is its complete
relationship with Timeline construction. The completed Timeline retains only its absolute domain and
the named absolute values declared by its author graph.

When a domain package must project local evidence, it consumes the complete exact local domain and
its explicitly placed Window. Local zero maps to the Window start and the local exclusive end maps to
the Window end; intermediate exact positions are resolved only on the selected Timeline Clock. More
general trim, retime, reverse, hold and loop relationships are represented by Temporal Maps rather
than being inferred by Timeline construction. The projector publishes ordinary absolute Instants and
Windows and erases its proof inputs.

A component consumes a completed Window or Instant; it never authors an anonymous time value on its
own surface. Put a named child in Timeline when it participates in the construction DAG. When the
Timeline is already complete, publish an independent named value or consume a value supplied by a
domain projection:

```svml
<time:Window id="reveal-band" timeline={film.timeline}
  from={reveal} until={answer-end}/>
<time:Instant id="after-reveal" timeline={film.timeline} at={reveal} offset="+5f"/>
<time:Instant id="credits" timeline={film.timeline} at="timeline.end-2s"/>

<visual:Clip during={reveal-band} .../>
```

The standalone Window publishes `reveal-band`, `reveal-band.start` and `reveal-band.end`. A standalone
Instant either authors an absolute expression or gives an existing Instant one explicit signed
offset. An existing Instant that needs no offset should be referenced directly rather than aliased.
Absolute value Types are the common waist; Timeline and Narrative projection are only two possible
producers of them.
