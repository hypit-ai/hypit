# `@svml/source`

The smallest source bootstrap shared by Author and Run compilation.

It recognizes exactly one mandatory bounded Header:

```xml
<?svml using="@svml/text@1"?>
```

The Header selects an exact trusted Frontend. There is no suffix dispatch and no default parser.
The package masks the Header while preserving character offsets, but does not recognize imports,
XML, Script, Recipes, Run syntax or domain Types. Those belong to the selected Frontend.
