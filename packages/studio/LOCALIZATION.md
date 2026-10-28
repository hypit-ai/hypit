# Localizing Studio

Studio owns its interface messages; a language pack supplies their wording. The
English catalog in [locales/en.json](locales/en.json) is the complete list of
message IDs. [Simplified Chinese](locales/zh-CN.json) uses exactly the same format
as any additional language. A pack is JSON data, not executable code.

## Add a language

Copy `locales/en.json`, change `locale` (a BCP 47 tag such as `ja` or `pt-BR`),
`name` (the language's native name), and translate the message values. Keep the
message IDs. `direction` is `ltr` or `rtl` and controls translated text; it does
not reverse the physical video timeline or canvas coordinates.

A small, valid starting point is:

```json
{
  "locale": "ja",
  "name": "日本語",
  "direction": "ltr",
  "messages": {
    "app.studio": "スタジオ",
    "app.comments": "コメント",
    "app.language": "言語"
  }
}
```

Missing messages use English, so a partial translation is useful immediately.
Text is displayed as text, never interpreted as HTML. Preserve named variables
such as `{name}` and `{count}`; their order may change to suit the language.
Messages with `{count}` can be strings or plural forms:

```json
{ "one": "{count} item", "other": "{count} items" }
```

Use the language's `Intl.PluralRules` categories (`zero`, `one`, `two`, `few`,
`many`, `other`); `other` is required. Numbers and interface dates use the chosen
locale. Choose natural full sentences instead of assembling translated fragments.

Check and load your file:

```sh
hypit studio --check-locale ./ja.json
hypit studio --invocation ./render.svrun --locale-pack ./ja.json
```

The check lists missing translations and unknown IDs and reports malformed
messages or renamed variables. It does not open an Invocation or require a Runtime.
Relative file paths start at the command's working directory; prefix them with
`./` or `../`. Repeat `--locale-pack` to load multiple languages. Packs are read
at server startup; restart Studio after editing a pack. An explicitly loaded
pack with an existing locale replaces that locale's pack, with English fallback
for any omitted messages.

## Share a language pack

A local file is sufficient. For reuse, publish it through an ordinary package
under your own scope; there is no Hypit language registry or separate approval
step. Export the JSON file in the package's `package.json`, for example:

```json
{
  "name": "@your-scope/studio-ja",
  "version": "1.0.0",
  "files": ["ja.json"],
  "exports": { "./locale.json": "./ja.json" }
}
```

Install it using the project's package manager, then load it explicitly:

```sh
hypit studio --invocation ./render.svrun --locale-pack @your-scope/studio-ja/locale.json
```

Package exports resolve from the project, or `--package-root` when specified.
Studio reads the resolved JSON without importing package code. It neither scans
for language packs nor installs missing packages.

## Interface behavior and ownership

The globe menu to the left of **Studio / Comments** lists loaded languages by
their native names. The first visit follows the browser's language preferences;
subsequent visits retain the choice saved in that browser. Switching updates
marked labels in place, preserving the playhead, selection and comment draft.

Only Studio-owned interface text belongs in this catalog. Component names,
Companion-supplied labels, Source code, user comments and raw service diagnostics
retain their original text. Language packs do not change the Companion ABI,
Core, compilation, or rendering. A component remains the owner of its labels.

When adding Studio UI, give each message a stable ID in the English catalog and
use the helpers in `src/ui/i18n.ts` for text and attributes. Do not use English
wording as IDs, inspect DOM text to guess what needs translation, or put language
branches into components. Keep interpolation values separate from message text.
