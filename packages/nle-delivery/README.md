# @hypit/nle-delivery

Project-scoped composition of accepted SVML, Project Media and selected npm package contributions. It links one NLE
snapshot to AVIR, closes Picture as `HtmlProgram` and Audio as `AudioProgram`, builds an `HtmlVideoDeliveryPlan` and
submits that plan to the Application-provided HTML Video Executor. The Service owns its project-local delivery Action
handles, progress, cancellation and destination validation; it owns neither the document nor the completed result.
