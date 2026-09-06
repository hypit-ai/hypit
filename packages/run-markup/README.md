# `@hypit/run-markup`

Official human-readable Frontend for `@hypit/run`.

One Run Source is self-described and names one Author Source explicitly:

```xml
<?svml using="@hypit/run-markup@1"?>
<svrun version="1">
  <author source="./main.svml"/>
  <target output="final.video"/>

  <build-record id="opening" build="prior-build-id" output="opening-take"/>
  <file id="approved" type="@hypit/artifact@1#BlobArtifact" from="./approved.mp4" media-type="video/mp4"/>
  <satisfy output="opening-take" candidate="opening"/>
</svrun>
```

The Author Source's own Header—not this file and not its suffix—selects its Author Frontend.

`<value>` declares a typed zero-input `StoredValue`; its JSON file includes the wrapper, such as
`{"kind":"inline","value":{"enabled":true}}`, with the inner value matching the declared Type.
`<file>` admits ordinary source
bytes as the explicitly named blob Type; Run itself does not assume an Artifact module.
`<build-record>` exposes one exact named Output from a prior Build Result as a zero-input Candidate. `<fragment>`
instantiates a trusted package Fragment and may
export several Candidates backed by shared Operations. Two declarations are two instances; one
declaration with several exports is one instance.

The `output` on `<build-record>` is the prior Result's unique public Output name. After Core plans the
complete Author and Run graphs, the Host resolves only the selected zero-input Candidate sources;
unreached local values, local files and historical Outputs are not opened. Core receives only the typed Candidate value,
and the historical value receives no automatic semantic-relationship claim
against the output it is selected to satisfy.

Results are not selected automatically by repeating a Run, retaining an output name, or changing only
its Targets. Cross-Build reuse requires an explicit Candidate selection. Removing a `satisfy` returns
that Logical Output to its primary Candidate and can make the displaced generation route reachable
again. Preserve unrelated selections when revising a Run.

Imports form the opening prologue. They name Fragment libraries already admitted by the Host; they
do not install packages. Provider credentials, queues, Stores, Endpoint bindings and inline
callbacks are not Run language elements.

## Fragment input references

`<input name="media" from="opening-media.media"/>` names a public value of the Run's Author
entry. A computed Author Output remains a graph dependency, with its selected Candidate applied.
The reference is not another Run Candidate name and does not expose a nested Source namespace that
the Author entry has not published.

`<input name="duration" value="5"/>` supplies a scalar. The parser recognizes numbers, booleans
and null; other text is a string. Typed object inputs are obtained through `from`, not by placing
JSON in a scalar attribute. `<value>` reads a serialized typed value as a Candidate for a Logical
Output; it does not introduce an Author binding for Fragment inputs.

Fragment exports are available as `<instance-id>.<export-name>`. Optional `<export name="video"/>`
children expose selected exports; omitting them exposes all Fragment exports. Their shared required
operations remain one instance. Imports precede Targets and Candidate declarations, following the
required `author` declaration.
