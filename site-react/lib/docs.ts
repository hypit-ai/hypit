import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export type DocHeading = { id: string; text: string; level: number }

export type Doc = {
  title: string
  description: string
  body: string
  headings: DocHeading[]
}

/** Fenced code blocks, in document order, keyed for lookup at render time. */
export function extractCodeBlocks(body: string) {
  const blocks: Array<{ key: string; lang: string; code: string }> = []
  const pattern = /^```([a-zA-Z0-9-]*)\n([\s\S]*?)^```$/gm
  let match: RegExpExecArray | null
  while ((match = pattern.exec(body)) !== null) {
    blocks.push({ key: `${blocks.length}`, lang: match[1], code: match[2].replace(/\n$/, '') })
  }
  return blocks
}

const CONTENT_ROOT = join(process.cwd(), 'content')

/** Same slug rule the renderer uses, so TOC links match the rendered ids. */
export function slugifyHeading(text: string) {
  return text
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^\w一-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function stripInlineMarkup(text: string) {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .trim()
}

export function readDoc(lang: 'en' | 'zh', slug: string): Doc {
  const raw = readFileSync(join(CONTENT_ROOT, lang, `${slug}.md`), 'utf8')

  const frontmatter = raw.match(/^---\n([\s\S]*?)\n---\n/)
  const body = frontmatter ? raw.slice(frontmatter[0].length) : raw
  const meta = frontmatter?.[1] ?? ''
  const title = meta.match(/^title:\s*(.+)$/m)?.[1]?.trim() ?? slug
  const description = meta.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? ''

  // Only h2s become table-of-contents entries; h1 is the page title and h3+ is
  // too granular for the narrow rail.
  const headings: DocHeading[] = []
  let inFence = false
  for (const line of body.split('\n')) {
    if (line.startsWith('```')) inFence = !inFence
    if (inFence) continue
    const match = line.match(/^(##)\s+(.+)$/)
    if (!match) continue
    const text = stripInlineMarkup(match[2])
    headings.push({ id: slugifyHeading(text), text, level: 2 })
  }

  return { title, description, body, headings }
}
