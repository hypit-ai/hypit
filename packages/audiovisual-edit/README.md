# @hypit/audiovisual-edit

Syntax- and UI-independent edit commands over a closed `AudiovisualProgram`.
The package owns transient editing policy such as move, trim, slip, roll, ripple and split.
It stores no Track, lane, frame clock or presentation state; `@hypit/audiovisual` remains the
resolved programme algebra and sole owner of audiovisual facts.

Move, trim, slip, roll and ripple preserve Occurrence identities, so occurrence- and source-bound
Controls continue to close from the edited facts. Split is the identity-changing operation. Its
`split-uses` plan is intentionally limited to graphs that do not bind a Control to the original
Occurrence. A controlled branch must provide an explicit replacement Picture or Audio graph which
duplicates the necessary Operator path and binds each copy to the left or right Occurrence. The edit
package never guesses a cloning boundary and never bakes an occurrence-local Control into absolute time.
