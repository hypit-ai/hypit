'use client'

import Link from 'next/link'
import { GUIDE_SECTIONS } from './DocsLayout'
import { useSite } from './SiteContext'
import styles from './DocPager.module.css'

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M15 4 7 12l8 8' : 'M9 4l8 8-8 8'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Paging stays inside one section: Get started and Develop are separate sets,
 * so the last page of one does not lead into the other.
 */
export function DocPager({ slug }: { slug: string }) {
  const { t, lang } = useSite()
  const section = GUIDE_SECTIONS.find((group) => group.items.some((item) => item.slug === slug))
  if (!section) return null

  const index = section.items.findIndex((item) => item.slug === slug)
  const previous = index > 0 ? section.items[index - 1] : null
  const next = index < section.items.length - 1 ? section.items[index + 1] : null
  if (!previous && !next) return null

  const label = (item: { en: string; zh: string }) => (lang === 'en' ? item.en : item.zh)

  return (
    <nav className={styles.pager} aria-label={t('Page navigation', '翻页导航')}>
      {previous && (
        <Link href={`/guide/${previous.slug}`} className={styles.link}>
          <span className={styles.title}>{label(previous)}</span>
          <span className={styles.meta}>
            <Chevron direction="left" />
            {t('Previous', '上一页')}
          </span>
        </Link>
      )}
      {next && (
        <Link href={`/guide/${next.slug}`} className={`${styles.link} ${styles.next}`}>
          <span className={styles.title}>{label(next)}</span>
          <span className={styles.meta}>
            {t('Next', '下一页')}
            <Chevron direction="right" />
          </span>
        </Link>
      )}
    </nav>
  )
}
