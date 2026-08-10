# `@narratage/run-markup`

Official human-readable Frontend for `@narratage/run`.

One Run Source is self-described and names one Author Source explicitly:

```xml
<?svml using="@narratage/run-markup@1"?>
<svrun version="1" targets="delivery">
  <author source="./main.svml"/>

  <target-set id="delivery">
    <target output="final.video" accepts="substitute"/>
  </target-set>

  <build-record id="opening" build="prior-build-id" output="opening-take"/>
  <satisfy output="opening-take" candidate="opening" fidelity="substitute"/>
</svrun>
```

The Author Source's own Header—not this file and not its suffix—selects its Author Frontend.

`<value>` declares a typed zero-input `StoredValue`. `<build-record>` exposes a verified prior
Build Record as a zero-input Candidate. `<fragment>` instantiates a trusted package Fragment and may
export several Candidates backed by shared Operations. Two declarations are two instances; one
declaration with several exports is one instance.

The `output` on `<build-record>` may be the prior source's public output alias. The Host resolves it
through its Build Catalog to the verified logical Record before Run compilation. Core never sees or
trusts the presentation alias, and the historical value receives no automatic semantic-relationship
claim against the output it is selected to satisfy.

Imports form the opening prologue. They name Fragment libraries already admitted by the Host; they
do not install packages. Provider credentials, queues, Stores, Endpoint bindings and inline
callbacks are not Run language elements.
