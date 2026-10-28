# @hypit/realization

This package owns the author declaration that durably selects an existing authored Record for one
Component output. It does not import Results, create values, execute operations or choose a Build
target.

~~~xml
<import as="realization" from="@hypit/realization@1"/>
<realization:Select output={generation.video} record={accepted-video}/>
~~~

The Compiler resolves both references inside the Author closure, verifies that their Types match and
later combines the durable selection with an optional Invocation override and the AuthorGraph primary.
