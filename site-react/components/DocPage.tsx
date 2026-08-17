'use client'

import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from './CodeBlock'
import { DocPager } from './DocPager'
import { DocsLayout, GUIDE_SECTIONS, type TocItem } from './DocsLayout'
import { useSite } from './SiteContext'
import styles from './DocPage.module.css'

export type DocBundle = {
  title: string
  body: string
  headings: { id: string; text: string }[]
}

/** Mirrors slugifyHeading in lib/docs.ts so anchors and TOC links agree. */
function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^\w一-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function headingText(children: React.ReactNode): string {
  if (typeof children === 'string') return children
  if (typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(headingText).join('')
  if (children && typeof children === 'object' && 'props' in children) {
    return headingText((children as { props: { children?: React.ReactNode } }).props.children)
  }
  return ''
}

export function DocPage({
  en,
  zh,
  slug,
  highlighted,
}: {
  en: DocBundle
  zh: DocBundle
  slug: string
  highlighted: Record<string, string>
}) {
  const { t, lang } = useSite()
  // Both languages ship to the client so the language toggle needs no refetch.
  const doc = lang === 'en' ? en : zh

  // Breadcrumb names the section this page belongs to, and links to its first
  // page, rather than a fixed "Docs" label.
  const section = GUIDE_SECTIONS.find((group) => group.items.some((item) => item.slug === slug))

  const toc: TocItem[] = doc.headings.map((heading, index) => ({
    id: heading.id,
    en: en.headings[index]?.text ?? heading.text,
    zh: zh.headings[index]?.text ?? heading.text,
  }))

  return (
    <DocsLayout toc={toc}>
      <p className={styles.crumb}>
        <Link href={`/guide/${section?.items[0].slug ?? 'quick-start'}`}>
          {section ? (lang === 'en' ? section.en : section.zh) : t('Docs', '文档')}
        </Link>
        {' / '}
        <span>{doc.title}</span>
      </p>

      <div className={styles.prose}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => <h1 className={styles.h1}>{children}</h1>,
            h2: ({ children }) => (
              <h2 id={slugify(headingText(children))} className={styles.h2}>
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 id={slugify(headingText(children))} className={styles.h3}>
                {children}
              </h3>
            ),
            // Upstream links are VitePress-relative; keep them working by
            // rewriting in-site paths and marking external ones.
            a: ({ href, children }) => {
              const target = href ?? ''
              const external = /^https?:/.test(target)
              return (
                <a
                  href={target}
                  className={styles.link}
                  {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
                >
                  {children}
                </a>
              )
            },
            pre: ({ children }) => <CodeBlock highlighted={highlighted}>{children}</CodeBlock>,
            table: ({ children }) => (
              <div className={styles.tableWrap}>
                <table className={styles.table}>{children}</table>
              </div>
            ),
          }}
        >
          {doc.body}
        </ReactMarkdown>
      </div>

      <DocPager slug={slug} />
    </DocsLayout>
  )
}
