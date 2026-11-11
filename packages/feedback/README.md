# `@hypit/feedback`

Project-owned, time-anchored review comments stored at `feedback/project.feedback.json`.

The file is independent of NLE, Scene, Result and Workbench state. Each comment names one explicit
project-relative `context`, so one project review file may contain notes for several NLE Projects,
Scenes or other reviewable documents. `at` is a non-negative time in seconds in that context; it is
review metadata, not audiovisual timing authority.

```json
{
  "format": "hypit.feedback@1",
  "comments": [
    {
      "id": "c-example",
      "context": "edits/film.nle.json",
      "at": 6.04,
      "text": "这里的切换再利落一点。",
      "resolved": false,
      "attachments": []
    }
  ]
}
```

Uploaded screenshots, reaction images and other comment-owned files live beside it under
`feedback/attachments/`; comments keep portable paths relative to the Feedback document. They do not become
accepted production assets in `media/`. Plain emoji remain ordinary Unicode in comment text.

The Node store reads the authoritative file for every mutation and atomically replaces it. Replace
and delete operations include the complete previously observed comment, so an Agent or another view
cannot be silently overwritten by a stale browser edit. Workbench selection, filters, drafts and the
current playhead remain Session state and never enter this file.
