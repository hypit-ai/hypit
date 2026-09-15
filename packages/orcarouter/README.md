# `@hypit/orcarouter`

The Model package for OrcaRouter chat: a sealed request carrying the catalogue model ID, a prompt Text
and any attached image Artifacts, and the reply Text it publishes.

Its `model` attribute is passed to the selected Endpoint unchanged, so the vendor namespace the
catalogue returned is the namespace that reaches the relay. The Surface accepts at most eight
`Reference` children; attaching images is only meaningful for a catalogue entry that declares image
input, and the Endpoint refuses the request when the chosen model does not. The Model selects no
Provider and no credential — the Runtime Profile chooses the Endpoint that fulfills the capability.
