# @hypit/scene-view

`@hypit/scene-view` owns durable editor-only facts for one `hypit.scene@1`
Project. It stores editor visibility and locks, performance-track locks, grid
preferences, and the performance display rate.

Selection, active workbench mode, playhead, orbit camera, hover, and gestures are
session state. Output visibility remains a Scene Project fact.

`projectSceneWorkbench` joins the Project and View into a finite read model for
the browser without serializing renderer instances.
