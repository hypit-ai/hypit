# Reference-video vocabulary decisions

After observations, select candidate packages and run `inspect_svml_vocabulary`. Read each selected
package README as syntax authority. Compare the observation against declared inputs, outputs,
attributes, children, ports, Recipe properties, timing behavior, appearance and examples.

Use this decision order:

1. Reuse one existing component when it fully expresses the observation.
2. Compose multiple existing components when their declared outputs and timing express it without
   changing the observed semantics.
3. Declare a real vocabulary gap only when neither option works.

Do not force a similar-looking tag into a role it does not own. Do not invent attributes or write a
nonexistent tag with the intention of implementing it later.

For a real gap, stop final-source authoring and read
`../local-author-package.md` completely. Implement and install the new project-local package, then
run `inspect_svml_vocabulary` against it before using its tag. The reference-video CLI remains
limited to observation and vocabulary inspection; it does not generate components. Gemini does not
write the package.
