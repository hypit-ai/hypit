# `@hypit/timed-transcript`

`@hypit/timed-transcript#TimedTranscript` is the one editable, provider-neutral speech timing
document attached to a Media Asset. Its JSON shape follows the useful part of WhisperX aligned JSON:
segments and words use seconds, while recognizer scores, model identity and workflow state do not
become media data.

Detection and authored-text correction both publish this same document. A correction replaces the
document; it does not create an active/preferred transcript registry. The Media Asset Representation
supplies media identity and temporal binding, so the transcript does not repeat either one.
