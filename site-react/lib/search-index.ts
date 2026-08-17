import 'server-only'
import { readDoc, slugifyHeading } from './docs'

/** One searchable chunk: a page section, or the page's own opening. */
export type SearchEntry = {
  /** Route slug, e.g. "quick-start" */
  slug: string
  /** Page title, for the result's breadcrumb line */
  page: string
  /** Section heading; empty for the text before the first h2 */
  heading: string
  /** Anchor id, appended to the route when set */
  anchor: string
  /** Plain text of the section, already stripped of markup */
  text: string
}

/** Route slug → markdown filename, mirroring app/guide/[slug]/page.tsx. */
const MARKDOWN_SLUGS: Record<string, string> = {
  'quick-start': 'quick-start',
  script: 'script',
  stylesheet: 'styles',
  media: 'generation',
  timing: 'timing',
  captions: 'tracks',
  render: 'composition',
  build: 'run',
  develop: 'dev-develop',
  packages: 'dev-packages',
  'author-packages': 'dev-author-packages',
  providers: 'dev-providers',
  'runtime-profile': 'dev-runtime-profile',
  'caption-playground': 'dev-caption-playground',
  services: 'dev-services',
  testing: 'dev-testing',
  conventions: 'dev-conventions',
}

/**
 * Markdown to plain prose. Fenced code is dropped rather than indexed: it is
 * mostly punctuation and identifiers, and matching inside it produced snippets
 * that read as noise.
 */
function toPlainText(markdown: string) {
  return markdown
    .replace(/^```[\s\S]*?^```$/gm, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*\|.*\|\s*$/gm, ' ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Split a document at its h2s so a hit can link straight to the section. */
function splitSections(body: string) {
  const sections: { heading: string; lines: string[] }[] = [{ heading: '', lines: [] }]
  let inFence = false

  for (const line of body.split('\n')) {
    if (line.startsWith('```')) inFence = !inFence
    const match = inFence ? null : line.match(/^##\s+(.+)$/)
    if (match) {
      sections.push({ heading: match[1].trim(), lines: [] })
      continue
    }
    sections[sections.length - 1].lines.push(line)
  }

  return sections
}

/**
 * Builds the full index at module load — this file is server-only and the
 * pages that import it are static, so the work happens once at build time and
 * the result is serialised into the page payload.
 */
function buildIndex(lang: 'en' | 'zh'): SearchEntry[] {
  const entries: SearchEntry[] = []

  for (const [slug, file] of Object.entries(MARKDOWN_SLUGS)) {
    const doc = readDoc(lang, file)
    const pageTitle = doc.title

    for (const section of splitSections(doc.body)) {
      const text = toPlainText(section.lines.join('\n'))
      // A heading with no prose under it is still worth finding by name.
      if (!text && !section.heading) continue

      entries.push({
        slug,
        page: pageTitle,
        heading: section.heading,
        anchor: section.heading ? slugifyHeading(section.heading) : '',
        text,
      })
    }
  }

  return entries
}

export function getSearchIndex() {
  return { en: buildIndex('en'), zh: buildIndex('zh') }
}
