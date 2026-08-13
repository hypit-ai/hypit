import { notFound } from 'next/navigation'
import { DocPage } from '@/components/DocPage'
import { extractCodeBlocks, readDoc } from '@/lib/docs'
import { highlightCode } from '@/lib/highlight'

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

export function generateStaticParams() {
  return Object.keys(MARKDOWN_SLUGS).map((slug) => ({ slug }))
}

export default async function GuideDoc({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const file = MARKDOWN_SLUGS[slug]
  if (!file) notFound()

  const en = readDoc('en', file)
  const zh = readDoc('zh', file)

  // Shiki runs here, at build time. The client receives ready-made HTML keyed
  // by the code text, so the highlighter never ships to the browser.
  const highlighted: Record<string, string> = {}
  for (const block of [...extractCodeBlocks(en.body), ...extractCodeBlocks(zh.body)]) {
    if (highlighted[block.code]) continue
    const html = await highlightCode(block.code, block.lang)
    if (html) highlighted[block.code] = html
  }

  return (
    <DocPage
      slug={slug}
      highlighted={highlighted}
      en={{ title: en.title, body: en.body, headings: en.headings }}
      zh={{ title: zh.title, body: zh.body, headings: zh.headings }}
    />
  )
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const file = MARKDOWN_SLUGS[slug]
  if (!file) return {}
  const { title, description } = readDoc('en', file)
  return { title: `${title} · Narratage`, description }
}
