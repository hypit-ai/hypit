# @hypit/semantic-track

`SemanticTrack` is the single global semantic-timeline fact. It is the continuous program skeleton:
every item is a real segment-local `SemanticTake`, and global frame positions are the prefix sum of
their normalized local frame counts. There are no gap items or empty items. A Take may carry only
audio or only visual media; its word array may be empty. An empty Script Segment such as
`<empty></empty>` can therefore retain a real media span and both Segment anchors without speech.
An empty word array is not an empty Track item. Visual placement is deliberately not
part of this semantic truth.

The package exposes pure projections to `ProgramSpace` and `AudioTrack`, plus the
selection/segment/moment lookup functions used by semantic components. It performs no media I/O,
mixing, transcription or rendering.
