import 'server-only'

import { createHighlighter, type Highlighter, type ShikiTransformer } from 'shiki'
import { svsGrammar } from './svs-grammar'

// Semantic markers (@name, ~@name, @/name, the " | " dual-text divider) carry
// meaning that no general grammar knows about, so they are marked up after
// tokenizing. Ported from the upstream VitePress transformer.
function svmlSelectionHighlighter(): ShikiTransformer {
  return {
    name: 'svml-selection-highlighter',
    span(node) {
      const text = node.children?.[0]
      if (!text || text.type !== 'text') return
      const value = text.value
      const pattern = /(~?@\/?[A-Za-z][\w-]*[!~]?| \| )/g
      const parts: Array<{ value: string; highlight: boolean }> = []
      let last = 0
      let match: RegExpExecArray | null

      while ((match = pattern.exec(value)) !== null) {
        if (match[1].startsWith('@') && value[pattern.lastIndex] === '/') continue
        if (match.index > last) parts.push({ value: value.slice(last, match.index), highlight: false })
        parts.push({ value: match[1], highlight: true })
        last = pattern.lastIndex
      }
      if (!parts.length) return
      if (last < value.length) parts.push({ value: value.slice(last), highlight: false })

      node.children = parts.map((part) =>
        part.highlight
          ? {
              type: 'element' as const,
              tagName: 'span',
              properties: { class: 'svml-selection' },
              children: [{ type: 'text' as const, value: part.value }],
            }
          : { type: 'text' as const, value: part.value },
      )
    },
  }
}

// svml and svk are XML-shaped; svs needs the bundled grammar.
const LANGUAGE_ALIAS: Record<string, string> = { svml: 'xml', svk: 'xml' }
const SUPPORTED = new Set(['xml', 'bash', 'json', 'powershell', 'svs'])

let highlighterPromise: Promise<Highlighter> | undefined

function getHighlighter() {
  highlighterPromise ??= createHighlighter({
    themes: ['github-light', 'github-dark'],
    langs: ['xml', 'bash', 'json', 'powershell', svsGrammar as never],
  })
  return highlighterPromise
}

/**
 * Returns highlighted HTML, or null when the language has no grammar — the
 * caller then renders the code as plain text rather than failing.
 */
export async function highlightCode(code: string, lang: string | undefined) {
  const resolved = LANGUAGE_ALIAS[lang ?? ''] ?? lang ?? ''
  if (!SUPPORTED.has(resolved)) return null

  const highlighter = await getHighlighter()
  return highlighter.codeToHtml(code, {
    lang: resolved,
    // Emits CSS variables for both themes, so dark mode needs no re-render.
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: false,
    transformers: [svmlSelectionHighlighter()],
  })
}
