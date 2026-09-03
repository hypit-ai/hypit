# Local preview material

`@hypit/preview-mock` replaces unresolved image, video, audio and SemanticTake needs with local
stand-ins so the authored Graph can be viewed without paid generation.

The realizer writes a working directory for the Run under `.hypit/preview/<run-name>/`, containing a
native mock Run, a Studio-ready preview Run and ordinary local resources. Re-running the command
updates that working directory. It is disposable preview material, not Build history or authoritative
project state.

The preview Run uses relative file Candidates and estimate timing. Mock media never enters Author
Source. Reference timing is used to select comparison windows, not to invent the preview's semantic
clock.

Use the exact `previewRun` path returned by the realizer. Do not reconstruct it from internal resource
names, and do not treat the presence of preview files as evidence that a paid Build ran.
