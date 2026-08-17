/* TextMate grammar for the SVS recipe language, copied verbatim from the
   upstream VitePress config. Shiki has no built-in grammar for it. */

export const svsGrammar = {
  name: "svs",
  scopeName: "source.svs",
  patterns: [
    { include: "#processing-instruction" },
    { include: "#close-tag" },
    { include: "#open-tag" },
    { include: "#comment" },
    { include: "#recipe-block" },
  ],
  repository: {
    "processing-instruction": {
      begin: "<\\?",
      end: "\\?>",
      beginCaptures: { "0": { name: "punctuation.definition.tag.xml" } },
      endCaptures: { "0": { name: "punctuation.definition.tag.xml" } },
      name: "meta.tag.preprocessor.xml",
      patterns: [
        { match: "\\bsvml\\b", name: "entity.name.tag.xml" },
        { include: "#attribute" },
      ],
    },
    "open-tag": {
      begin: "(<)(sheet)\\b",
      beginCaptures: {
        "1": { name: "punctuation.definition.tag.xml" },
        "2": { name: "entity.name.tag.xml" },
      },
      end: ">",
      endCaptures: { "0": { name: "punctuation.definition.tag.xml" } },
      patterns: [{ include: "#attribute" }],
    },
    "close-tag": {
      match: "(</)(sheet)(>)",
      captures: {
        "1": { name: "punctuation.definition.tag.xml" },
        "2": { name: "entity.name.tag.xml" },
        "3": { name: "punctuation.definition.tag.xml" },
      },
    },
    attribute: {
      match: '([\\w-]+)(=)("[^"]*")',
      captures: {
        "1": { name: "entity.other.attribute-name.xml" },
        "2": { name: "punctuation.separator.key-value.xml" },
        "3": { name: "string.quoted.double.xml" },
      },
    },
    comment: {
      name: "comment.block.css",
      begin: "/\\*",
      end: "\\*/",
    },
    "recipe-block": {
      begin: "([a-z][\\w-]*)(\\.)(\\S+)\\s*(\\{)",
      beginCaptures: {
        "1": { name: "entity.name.tag.css" },
        "2": { name: "punctuation.accessor.css" },
        "3": { name: "entity.other.attribute-name.class.css" },
        "4": { name: "punctuation.section.block.begin.css" },
      },
      end: "\\}",
      endCaptures: { "0": { name: "punctuation.section.block.end.css" } },
      patterns: [{ include: "#comment" }, { include: "#property-declaration" }],
    },
    "property-declaration": {
      begin: "([a-z][\\w-]*)\\s*(:)",
      beginCaptures: {
        "1": { name: "support.type.property-name.css" },
        "2": { name: "punctuation.separator.key-value.css" },
      },
      end: ";",
      endCaptures: { "0": { name: "punctuation.terminator.rule.css" } },
      patterns: [{ include: "#property-value" }],
    },
    "property-value": {
      patterns: [
        { match: "#[0-9A-Fa-f]{3,8}\\b", name: "constant.other.color.css" },
        { match: "\\b\\d+(?:\\.\\d+)?\\b", name: "constant.numeric.css" },
        { match: "\\./[^;\\s]+", name: "string.unquoted.css" },
        { match: "[a-zA-Z][\\w:-]+", name: "support.constant.property-value.css" },
      ],
    },
  },
} as const
