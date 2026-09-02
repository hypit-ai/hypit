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

`<value>` declares a typed zero-input `StoredValue`. `<file>` admits ordinary source
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

Imports form the opening prologue. They name Fragment libraries already admitted by the Host; they
do not install packages. Provider credentials, queues, Stores, Endpoint bindings and inline
callbacks are not Run language elements.
