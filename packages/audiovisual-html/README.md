# `@hypit/audiovisual-html`

Pure, one-way lowering from one resolved AVIR Picture Programme into `HtmlProgram`. AVIR remains renderer-neutral;
HTML terminal bindings live beside one invocation and never enter NLE or AVIR documents. The resulting programme is
consumed unchanged by Chromium and Electron implementations.

Lowering accepts an explicit Programme range, uses AVIR demand planning for its exact output observations and closes
the complete selected Picture graph as one HTML programme. Package contributions may implement selected Picture
reconstructions; a missing implementation is rejected while linking.
