# Script and speech timing

Script owns authored speech, named Segments and speaker turns, display-to-speech correspondence, caption breaks and
named boundaries. The source file is durable. `parseScript(sourceName, source)` produces an in-memory value for the
calling program. A Segment provides the explicit `spokenWords` list for one transcript alignment.

| Object | Meaning |
| --- | --- |
| Word | One displayed surface and its spacing and attributes, or one lexical token in the separate speech list. |
| Unit | One display-to-speech correspondence. All its display Words share the measured envelope of its spoken span. |
| Cue | A display group for a speaker role. It contains ordered Units and can be placed as one subtitle Item. |
| Moment / Selection | Named point or range of word boundaries in a Segment, with explicit affinity across pauses. |

`@hypit/timed-transcript` owns the measured word document and alignment. `@hypit/script/timing` binds one parsed
Segment against a prepared transcript in the window and clock the caller selects. It returns exact timed Word
evidence, Cue/Unit windows and named point/range queries. Measurements, names and positions are ordinary values
available to any caller. Script and timing evaluation have no open Host lifetime.

The project program explicitly selects the accepted Media and prepares the transcript on that Media clock before
calling the Composition Source. NLE authoring projects a bound point or range through a selected placement. The
selected caption family builds its Item parameters on the Item's local clock. The program chooses role styles,
visibility padding and placement; the caption component evaluates display behavior; NLE owns the resulting edit.
The [Script package README](../packages/script/README.md) holds the syntax and public usage.
