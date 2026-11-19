# `@hypit/media`

Execution-independent media observations, explicit stream selection and durable picture/audio interpretation.
It owns neither project files nor NLE placement, delivery, fonts, Providers or platform execution.

Read an already accepted Media Asset through the Project Media Service, then pass its interpretation to
`selectMediaSourceWindow(interpretation, { member: "audio", start, duration })` to select an exact source window.
`start` defaults to Media time zero, and an omitted `duration` selects through the end of the Media domain.
The result supplies `start`, `end` and `duration` in the Media clock. NLE placement supplies the program clock.
